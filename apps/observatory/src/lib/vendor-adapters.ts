import { FEATURE_NAMES, type ClassifierAdapter, type Decision, type Signal, type FeatureName } from './classification';

export const VENDOR_QUESTION = 'Was this transaction directed by an AI agent under target ai-directed-execution/1?';
export const VENDOR_PROMPT = 'Estimate whether an AI agent directed execution, rather than a human manually operating a service (including AI writing assistance). Only normalized sensor values and missingness are supplied. Signature verification establishes identity, not AI direction; browser/device presence does not establish human operation. No authority, fraud or eligibility inference is requested. This is an experimental unvalidated classification hypothesis.';
export type Vendor = 'jev' | 'openai-decisions';
export type VendorSettings = { enabled: boolean; key?: string; model: string; dailyCalls: number; dailyMicroUsd: number; reservationMicroUsd: number; minIntervalMs: number };
const outcome = (reason: string, status: 'error' | 'abstain' = 'abstain'): Decision => ({ status, class: null, score: null, reason, raw_result_ref: null, estimated_cost: { amount: null, currency: 'USD' } });
export function vendorSettings(vendor: Vendor, env: NodeJS.ProcessEnv = process.env): VendorSettings {
  const prefix = vendor === 'jev' ? 'OBSERVATORY_JEV' : 'OBSERVATORY_OPENAI';
  return { enabled: env[`${prefix}_ENABLED`] === 'true', key: env[vendor === 'jev' ? 'TYPESAFE_API_KEY' : 'OPENAI_API_KEY'], model: env[`${prefix}_MODEL`] ?? (vendor === 'jev' ? 'jev-1.13.0' : 'gpt-6-luna'), dailyCalls: Number(env[`${prefix}_DAILY_CALLS`] ?? 0), dailyMicroUsd: Number(env[`${prefix}_DAILY_MICRO_USD`] ?? 0), reservationMicroUsd: Number(env[`${prefix}_RESERVATION_MICRO_USD`] ?? 0), minIntervalMs: Number(env[`${prefix}_MIN_INTERVAL_MS`] ?? 1000) };
}
export function blindedValues(signals: Partial<Record<FeatureName, Signal>>) {
  return Object.fromEntries(FEATURE_NAMES.map(f => [f, { value: signals[f]?.value ?? null, missingness: signals[f]?.missingness ?? 'not_observed' }]));
}
export function vendorAdapter(vendor: Vendor, settings: VendorSettings, reserve: (vendor: Vendor, settings: VendorSettings) => Promise<boolean>, transport: typeof fetch = fetch): ClassifierAdapter {
  return { identifier: vendor, version: '1-official-contract-20261014', schema: 'observatory-classifier-config/1', model: settings.model, feature_set: [...FEATURE_NAMES], async classify(signals, config) {
    if (!settings.enabled || !settings.key) return outcome('DETECTOR_NOT_CONFIGURED');
    if (config.question !== VENDOR_QUESTION || config.prompt !== VENDOR_PROMPT) return outcome('VENDOR_QUESTION_VERSION_MISMATCH', 'error');
    const numbers = [settings.dailyCalls, settings.dailyMicroUsd, settings.reservationMicroUsd, settings.minIntervalMs];
    if (numbers.some(n => !Number.isSafeInteger(n) || n <= 0) || settings.reservationMicroUsd > settings.dailyMicroUsd || settings.dailyCalls > 1000 || settings.dailyMicroUsd > 100_000_000 || settings.minIntervalMs < 100) return outcome('DETECTOR_BUDGET_NOT_CONFIGURED');
    if (!FEATURE_NAMES.some(f => signals[f]?.missingness === 'observed')) return outcome('NO_OBSERVED_FEATURES');
    const state = blindedValues(signals);
    const instructions = `${VENDOR_QUESTION}\n${VENDOR_PROMPT}`;
    const body = vendor === 'jev' ? { model: settings.model, state, questions: { ai_directed: { type: 'noul', instructions } } } : { model: settings.model, input: JSON.stringify(state), questions: [{ type: 'predicate', name: 'ai_directed', instructions }] };
    const encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded) > 4096) return outcome('DETECTOR_INPUT_TOO_LARGE', 'error');
    try {
      // Reservation is durable and never refunded: failed calls/reruns consume caps too.
      if (!await reserve(vendor, settings)) return outcome('DETECTOR_BUDGET_OR_RATE_LIMIT');
      const response = await transport(vendor === 'jev' ? 'https://api.typesafe.ai/v1/systemone' : 'https://api.openai.com/v1/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.key}` }, body: encoded, signal: AbortSignal.timeout(5000), cache: 'no-store', redirect: 'error' });
      if (!response.ok) return outcome(response.status === 429 ? 'DETECTOR_RATE_LIMITED' : response.status === 401 || response.status === 403 ? 'DETECTOR_AUTHENTICATION_FAILED' : 'DETECTOR_UNAVAILABLE', 'error');
      const text = await response.text(); if (text.length > 64_000) return outcome('DETECTOR_RESPONSE_TOO_LARGE', 'error');
      const data = JSON.parse(text);
      if (data.model !== settings.model) return outcome('DETECTOR_MODEL_VERSION_MISMATCH', 'error');
      const answer = vendor === 'jev' ? data.answers?.ai_directed : Array.isArray(data.answers) && data.answers.length === 1 ? data.answers[0] : null;
      if (vendor === 'openai-decisions' && answer?.name === 'ai_directed' && answer.type === 'refusal') return outcome('DETECTOR_REFUSED');
      const score = vendor === 'jev' && answer?.type === 'noul' ? answer.noul : vendor === 'openai-decisions' && answer?.type === 'predicate' && answer?.name === 'ai_directed' ? answer.probability : null;
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return outcome('DETECTOR_SCHEMA_CHANGED', 'error');
      return { status: 'classified', class: score >= config.threshold ? 'AI_DIRECTED' : 'HUMAN_OPERATED', score, reason: 'UNVALIDATED_VENDOR_EXECUTION_HYPOTHESIS', raw_result_ref: null, estimated_cost: { amount: null, currency: 'USD' } };
    } catch { return outcome('DETECTOR_REQUEST_FAILED', 'error'); }
  } };
}

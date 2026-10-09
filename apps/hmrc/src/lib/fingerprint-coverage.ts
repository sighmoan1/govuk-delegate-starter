// Shared, deliberately credential-free coverage vocabulary. Identification is
// a browser signal, never a statement that an actor is a human or an agent.
export const coverageStates = ["not_run", "blocked", "error", "missing", "identified"] as const;
export type CoverageState = typeof coverageStates[number];
export type SensorSample = { state: CoverageState; event_id?: string; visitor_id?: string; error_code?: string };

export function initialCoverage(enabled: boolean, publicKey?: string): CoverageState {
  return !enabled ? "not_run" : !publicKey?.trim() ? "missing" : "not_run";
}

export function errorCoverage(error: unknown): SensorSample {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
  // A generic network failure does not establish an ad blocker. Only explicit
  // CSP/script-loading failures are classified as blocked coverage.
  return { state: ["csp_block", "script_load_fail", "sandboxed_iframe"].includes(code) ? "blocked" : "error",
    error_code: /^[a-z_]{1,64}$/.test(code) ? code : "unknown" };
}

export function parseSample(input: unknown): SensorSample | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (!coverageStates.includes(raw.state as CoverageState)) return null;
  const id = (value: unknown) => value === undefined || (typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value));
  if (!id(raw.event_id) || !id(raw.visitor_id) || !id(raw.error_code)) return null;
  if (raw.state === "identified" && !raw.event_id) return null;
  if (raw.state !== "identified" && (raw.event_id || raw.visitor_id)) return null;
  return { state: raw.state as CoverageState, ...(raw.event_id ? { event_id: raw.event_id as string } : {}),
    ...(raw.visitor_id ? { visitor_id: raw.visitor_id as string } : {}),
    ...(raw.error_code ? { error_code: raw.error_code as string } : {}) };
}

import { describe, expect, it } from "vitest";
import { missing, known, type ResearchEvent } from "@prototype/research-feed";
import { classifyFrozen, digest, experiment, mockSensor, stubRule, unavailablePaid, type ClassifierAdapter } from "../src/lib/classification";
const event = (signature: boolean | null = true): ResearchEvent => ({ schema_version: 1, source_service: "hmrc", source_event_id: "opaque-event-id", event_kind: "service_request", occurred_at: { value: "2026-10-09T10:00:00.000Z", status: "known", provenance: "source_clock" }, run_id: { value: "HUMAN_OPERATED-secret-run-tag", status: "inferred", provenance: "client_claim" }, correlation: { request_id: missing(), transaction_id: missing(), session_id: missing(), delegate_check_id: missing() }, observed: { lane: "AUTHORISED_AGENT", signature_verified: known(signature), latency_ms: known(10) }, outcome: { decision: "ALLOW", outcome_class: missing(), cost_class: missing() }, browser_sensor: { status: "not_run", provenance: "not_collected" } });
describe("blind versioned classification", () => {
  it("mock sensor and stub run end-to-end without converting signatures into execution truth", async () => {
    const evidence = await mockSensor.collect(event()); const config = experiment(stubRule); const result = await classifyFrozen(evidence, config, stubRule);
    expect(result).toMatchObject({ status: "classified", class: "VERIFIED_SIGNATURE", score: 1, source_version: "1.0.0", threshold: .5, missingness: { signature_verified: "observed" }, estimated_cost: { amount: 0 } });
    expect(result.config_digest).toBe(digest(config)); expect(result.input_digest).toBe(digest(evidence)); expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(evidence)).not.toContain("HUMAN_OPERATED"); expect(JSON.stringify(evidence)).not.toContain("outcome"); expect(JSON.stringify(evidence)).not.toContain("lane");
  });
  it("API-only absence never means human and unavailable paid detectors abstain honestly", async () => {
    const evidence = await mockSensor.collect(event(null));
    expect(evidence.signals.browser_present).toMatchObject({ value: null, missingness: "not_observed" });
    expect(await classifyFrozen(evidence, experiment(stubRule), stubRule)).toMatchObject({ status: "abstain", score: null, class: null, reason: "SIGNATURE_NOT_OBSERVED" });
    expect(await classifyFrozen(evidence, experiment(unavailablePaid), unavailablePaid)).toMatchObject({ status: "abstain", reason: "DETECTOR_NOT_CONFIGURED", estimated_cost: { amount: null } });
    expect(await classifyFrozen(await mockSensor.collect(event(false)), experiment(stubRule), stubRule)).toMatchObject({ status: "abstain", class: null });
  });
  it("client-claimed signature values cannot become verified identity", async () => {
    const e = event(); e.observed.signature_verified = { value: true, status: "inferred", provenance: "client_claim" };
    expect(await classifyFrozen(await mockSensor.collect(e), experiment(stubRule), stubRule)).toMatchObject({ status: "abstain", reason: "SIGNATURE_PROVENANCE_UNVERIFIED" });
  });
  it("retains browser error and blocked missingness, not negative signal values", async () => {
    for (const status of ["error", "blocked"] as const) {
      const e = event(); e.browser_sensor = { status, provenance: "unverified_client_claim" };
      const evidence = await mockSensor.collect(e); expect(evidence.signals.browser_present).toMatchObject({ value: null, missingness: status === "error" ? "error" : "not_observed" });
    }
  });
  it("rejects ground truth and extra fields at collection boundary", async () => {
    await expect(mockSensor.collect({ ...event(), execution_class: "HUMAN_OPERATED" } as never)).rejects.toThrow();
  });
  it("only selected normalized features enter adapters; IDs/tags/generation prompts cannot leak", async () => {
    const evidence = await mockSensor.collect(event()); let received: unknown;
    const spy: ClassifierAdapter = { ...stubRule, async classify(signals) { received = signals; return stubRule.classify(signals, experiment(stubRule)); } };
    await classifyFrozen(evidence, experiment(spy), spy);
    expect(Object.keys(received as object)).toEqual(["signature_verified"]); expect(JSON.stringify(received)).not.toContain("opaque-event-id"); expect(JSON.stringify(received)).not.toContain("HUMAN");
  });
  it("same frozen input is deterministic and earlier result/config/input cannot be mutated", async () => {
    const evidence = await mockSensor.collect(event()); const config = experiment(stubRule); const before = JSON.stringify({ evidence, config });
    const first = await classifyFrozen(evidence, config, stubRule); const frozen = JSON.stringify(first);
    const second = await classifyFrozen(evidence, config, stubRule);
    expect({ ...first, latency_ms: 0 }).toEqual({ ...second, latency_ms: 0 }); expect(JSON.stringify(first)).toBe(frozen); expect(JSON.stringify({ evidence, config })).toBe(before);
    const mutating: ClassifierAdapter = { ...stubRule, async classify(signals) { signals.signature_verified!.value = false; throw new Error("secret vendor credential"); } };
    expect(await classifyFrozen(evidence, config, mutating)).toMatchObject({ status: "error", class: null, score: null, reason: "ADAPTER_ERROR" }); expect(JSON.stringify({ evidence, config })).toBe(before);
  });
  it("invalid/inconsistent inputs and adapter failures are explicit errors", async () => {
    const e = await mockSensor.collect(event()); e.signals.signature_verified.value = null;
    expect(await classifyFrozen(e, experiment(stubRule), stubRule)).toMatchObject({ status: "error", reason: "INCONSISTENT_SIGNALS" });
    const evidence = await mockSensor.collect(event());
    expect(await classifyFrozen(evidence, { ...experiment(stubRule), model: "wrong" }, stubRule)).toMatchObject({ status: "error", reason: "ADAPTER_CONFIG_MISMATCH" });
    expect(() => experiment(stubRule, NaN)).toThrow("INVALID_THRESHOLD");
    const broken: ClassifierAdapter = { ...stubRule, async classify() { return { status: "classified", score: NaN, class: "bad" } as never; } };
    expect(await classifyFrozen(evidence, experiment(broken), broken)).toMatchObject({ status: "error", reason: "ADAPTER_ERROR" });
  });
  it("malformed adapter cost/reason/reference metadata remains an error", async () => {
    const evidence = await mockSensor.collect(event());
    for (const extra of [{ estimated_cost: { amount: -1, currency: "USD" } }, { reason: 5 }, { raw_result_ref: {} }]) {
      const broken: ClassifierAdapter = { ...stubRule, async classify(signals, config) { return { ...await stubRule.classify(signals, config), ...extra } as never; } };
      expect(await classifyFrozen(evidence, experiment(broken), broken)).toMatchObject({ status: "error", reason: "ADAPTER_ERROR" });
    }
  });
  it("canonical digest survives JSON key reordering", () => { expect(digest({a:1,b:{c:2,d:3}})).toBe(digest({b:{d:3,c:2},a:1})); });
});

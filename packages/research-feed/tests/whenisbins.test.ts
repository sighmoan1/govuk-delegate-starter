import { expect, test } from "vitest";
import { WhenIsBinsEvent, Page, whenisbinsObservation, missing, pseudonym } from "../src/index";
const input = { sourceEventId: "f5b88321-76a2-4d27-8eac-b6ef9db74630", occurredAt: "2026-10-10T00:00:00.000Z", action: "lookup" as const, stage: "admitted" as const, decision: "ALLOW" as const, taskId: "private-task", signatureVerified: true };
test("projection emits only source-pseudonymised identifiers, not credentials or a verified AI label", () => {
 const e = whenisbinsObservation(input, "synthetic-key"); expect(JSON.stringify(e)).not.toContain("private-task"); expect(e.observed.lane).toBe("DECLARED_AGENT"); expect(e.whenisbins.upstream_agent_declared).toEqual(missing()); expect(e.whenisbins.task_id.value).not.toBe(pseudonym("hmrc", "task", input.taskId, "synthetic-key").value);
 expect(() => whenisbinsObservation(input, "")).toThrow();
});
test("all stages remain separate; admission never invents outcome completion", () => {
 for (const stage of ["admitted", "lookup_completed", "subscription_pending", "subscription_confirmed", "mail_delivery_observed", "cancellation_confirmed", "schedule_registered", "scheduled_occurrence", "replay", "provider_unavailable"] as const) expect(whenisbinsObservation({ ...input, stage }, "key").whenisbins.stage).toBe(stage);
 const e = whenisbinsObservation(input, "key"); expect(e.outcome.outcome_class).toEqual(missing()); expect(e.whenisbins.effect_id).toEqual(missing());
 expect(() => whenisbinsObservation({ ...input, stage: "refused" }, "key")).toThrow();
});
test("strict v2 rejects identifiers, arbitrary nested fields, labels and upstream fingerprints", () => {
 const e = whenisbinsObservation(input, "key");
 for (const field of ["email", "address", "property_token", "stop_link", "access_token", "execution_class"]) {
  expect(() => WhenIsBinsEvent.parse({ ...e, [field]: "private@example.com" })).toThrow();
  expect(() => WhenIsBinsEvent.parse({ ...e, whenisbins: { ...e.whenisbins, [field]: "private@example.com" } })).toThrow();
 }
 expect(() => WhenIsBinsEvent.parse({ ...e, source_event_id: "https://whenisbins.com/private" })).toThrow();
 expect(() => WhenIsBinsEvent.parse({ ...e, correlation: { ...e.correlation, request_id: { value: "private@example.com", status: "known", provenance: "source_record" } } })).toThrow();
 expect(() => WhenIsBinsEvent.parse({ ...e, browser_sensor: { status: "blocked", provenance: "unverified_client_claim" } })).toThrow();
 expect(() => Page.parse({ schema_version: 1, source_service: "whenisbins_connector", events: [e], next_cursor: null })).toThrow();
});

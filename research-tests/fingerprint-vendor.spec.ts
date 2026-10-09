import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "../apps/observatory/src/generated/prisma";

test("real opt-in EU vendor response persists as an unverified protected-session observation", async ({ page, request }) => {
  // Missing configuration is a hard failure, not a synthetic success or skip.
  expect(process.env.FINGERPRINT_VENDOR_TEST).toBe("true");
  const evaluationKey = process.env.OBSERVATORY_EVALUATION_KEY ?? "";
  const pseudonymKey = process.env.RESEARCH_PSEUDONYM_KEY ?? "";
  expect(evaluationKey.length >= 32 && pseudonymKey.length >= 32).toBe(true);
  const observer = process.env.TEST_OBSERVATORY_URL ?? "http://localhost:3303";
  const hmrc = process.env.TEST_HMRC_URL ?? "http://localhost:3302";
  const sourceCommit = process.env.RESEARCH_SOURCE_COMMIT ?? "";
  expect(/^[0-9a-f]{40}$/.test(sourceCommit)).toBe(true);
  const headers = { "x-evaluation-key": evaluationKey };
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${observer}/api/evaluation/${path}`, { headers, data });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  // Monitoring has no execution-class truth: this browser check never asserts
  // that an automated test is a human participant.
  const run = await post("runs", { mode: "MONITORING", protocol_version: "fingerprint-vendor-check-v1", source_commit: sourceCommit,
    seed: randomUUID(), study_owner: "configured-vendor-validation" });
  const attempt = await post("attempts", { run_id: run.id });
  const enrolment = await post("enrolments", { attempt_id: attempt.id });
  let vendorCalls = 0;
  page.on("request", r => { if (/fpjs\.io|fpjscdn\.net|fingerprint\.com|fpcdn\.io/.test(r.url())) vendorCalls++; });
  await page.goto(`${hmrc}/research/device-intelligence`);
  await expect(page.getByRole("button", { name: "Join device study" })).toBeVisible();
  expect(vendorCalls).toBe(0);
  await page.getByLabel("Researcher-issued enrolment token").fill(enrolment.enrollment_token);
  await page.getByRole("checkbox").check();
  const enrolResponse = page.waitForResponse(r => r.url().endsWith("/api/research/fingerprint/enrol") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Join device study" }).click();
  const enrol = await enrolResponse;
  expect(enrol.ok()).toBe(true);
  const binding = await enrol.json();
  const storedResponse = page.waitForResponse(r => r.url().endsWith("/api/research/fingerprint/sample") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Collect one browser sample" }).click();
  const stored = await storedResponse;
  expect(stored.ok()).toBe(true);
  const result = await stored.json();
  expect(result.state).toBe("identified");
  expect(result.verification).toBe("unverified_client_claim");
  // Assert IDs without printing them or using raw IDs as evaluator truth.
  const sample = stored.request().postDataJSON().sample;
  expect(typeof sample.event_id === "string" && sample.event_id.length > 0).toBe(true);
  expect(typeof sample.visitor_id === "string" && sample.visitor_id.length > 0).toBe(true);
  expect(vendorCalls > 0).toBe(true);
  const db = new PrismaClient();
  try {
    const row = await db.observedEvent.findUnique({ where: { sourceService_sourceEventId: { sourceService: "hmrc", sourceEventId: result.observation_id } } });
    expect(Boolean(row)).toBe(true);
    const event = row!.snapshot as any;
    const hash = (namespace: string, value: string) => createHmac("sha256", pseudonymKey).update(`hmrc:${namespace}:${value}`).digest("hex");
    expect(event.run_id.value === run.id).toBe(true);
    expect(event.correlation.session_id.value === hash("session", binding.session_id)).toBe(true);
    expect(event.browser_sensor.provenance).toBe("unverified_client_claim");
    expect(event.browser_sensor.event_id.value === hash("fingerprint-event", sample.event_id)).toBe(true);
    expect(event.browser_sensor.visitor_id.value === hash("fingerprint-visitor", sample.visitor_id)).toBe(true);
    expect(JSON.stringify(event).includes(sample.visitor_id)).toBe(false);
    await post("bindings", { attempt_id: attempt.id, source_service: "hmrc", source_event_id: result.observation_id, effect_class: "REQUEST_ONLY" });
    const ledgerSession = await db.researchSession.findUnique({ where: { id: binding.session_id } });
    expect(ledgerSession?.attemptId === attempt.id).toBe(true);
    const savedAttempt = await db.researchAttempt.findUnique({ where: { id: attempt.id } });
    expect(savedAttempt?.status).toBe("UNLABELLED");
    expect(savedAttempt?.executionClass).toBeNull();
  } finally { await db.$disconnect(); }
});

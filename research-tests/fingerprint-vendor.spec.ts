import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "../apps/observatory/src/generated/prisma";

test("real opt-in EU vendor response persists as an unverified protected-session observation", async ({ page, request }) => {
  // Missing configuration is a hard failure, not a synthetic success or skip.
  expect(process.env.FINGERPRINT_VENDOR_TEST).toBe("true");
  const evaluationKey = process.env.OBSERVATORY_EVALUATION_KEY ?? "";
  const pseudonymKey = process.env.RESEARCH_PSEUDONYM_KEY ?? "";
  const feedKey = process.env.RESEARCH_FEED_KEY ?? "";
  expect(evaluationKey.length >= 32 && pseudonymKey.length >= 32 && feedKey.length >= 32).toBe(true);
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
  // Two explicit measurements in the same enrolled session. Reloading the page
  // intentionally resets its UI enrolment state, so this checks repeat samples,
  // not a second browsing visit or physical-person continuity.
  const samples: Array<{ result: any; sample: any }> = [];
  for (let i = 0; i < 2; i++) {
    const storedResponse = page.waitForResponse(r => r.url().endsWith("/api/research/fingerprint/sample") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Collect one browser sample" }).click();
    const stored = await storedResponse;
    expect(stored.ok()).toBe(true);
    const result = await stored.json();
    expect(result.state).toBe("identified");
    expect(result.verification).toBe("unverified_client_claim");
    const sample = stored.request().postDataJSON().sample;
    expect(typeof sample.event_id === "string" && sample.event_id.length > 0).toBe(true);
    expect(typeof sample.visitor_id === "string" && sample.visitor_id.length > 0).toBe(true);
    samples.push({ result, sample });
  }
  expect(samples[0].sample.event_id !== samples[1].sample.event_id).toBe(true);
  expect(vendorCalls > 0).toBe(true);
  const db = new PrismaClient();
  try {
    const hash = (namespace: string, value: string) => createHmac("sha256", pseudonymKey).update(`hmrc:${namespace}:${value}`).digest("hex");
    const visitorHashes: string[] = [];
    for (const { result, sample } of samples) {
      const row = await db.observedEvent.findUnique({ where: { sourceService_sourceEventId: { sourceService: "hmrc", sourceEventId: result.observation_id } } });
      expect(Boolean(row)).toBe(true);
      const event = row!.snapshot as any;
      expect(event.run_id.value === run.id).toBe(true);
      expect(event.correlation.session_id.value === hash("session", binding.session_id)).toBe(true);
      expect(event.browser_sensor.provenance).toBe("unverified_client_claim");
      expect(event.browser_sensor.event_id.value === hash("fingerprint-event", sample.event_id)).toBe(true);
      expect(event.browser_sensor.visitor_id.value === hash("fingerprint-visitor", sample.visitor_id)).toBe(true);
      expect(JSON.stringify(event).includes(sample.visitor_id)).toBe(false);
      visitorHashes.push(event.browser_sensor.visitor_id.value);
      await post("bindings", { attempt_id: attempt.id, source_service: "hmrc", source_event_id: result.observation_id, effect_class: "REQUEST_ONLY" });
    }
    // Report only the observed comparison; neither result establishes identity.
    console.log(`Repeated sample visitor HMACs observed ${visitorHashes[0] === visitorHashes[1] ? "same" : "different"}; no physical-person continuity is inferred.`);

    // Browser-context requests share the actual server-issued research cookie.
    // No citizen/agent authority is supplied, so this is an observed request,
    // not proof of a successful business transaction or a human participant.
    const service = await page.context().request.get(`${hmrc}/api/tax-code`, { headers: { "x-run-tag": "untrusted-vendor-check-tag" } });
    expect(service.status() >= 400).toBe(true);
    const feed = await request.get(`${hmrc}/api/research/events?limit=200`, { headers: { authorization: `Bearer ${feedKey}` } });
    expect(feed.ok()).toBe(true);
    const serviceEvent = (await feed.json()).events.find((e: any) => e.event_kind === "service_request" && e.run_id.value === run.id);
    expect(Boolean(serviceEvent)).toBe(true);
    expect(serviceEvent.correlation.session_id.value === hash("session", binding.session_id)).toBe(true);
    expect(JSON.stringify(serviceEvent).includes("untrusted-vendor-check-tag")).toBe(false);

    // Use the production puller and its optimistic cursor transaction semantics
    // to ingest authenticated service evidence, not the sensor-only push route.
    const { pullSource } = await import("../apps/observatory/src/lib/ingestion");
    const pulled = await pullSource({ source: "hmrc", url: `${hmrc}/api/research/events?limit=200`, key: feedKey, store: {
      async cursor(source) {
        const row = await db.feedCursor.upsert({ where: { sourceService: source }, create: { sourceService: source }, update: {} });
        return { cursor: row.cursor, generation: row.generation };
      },
      async commit(source, expected, events, next) {
        return db.$transaction(async tx => {
          const changed = await tx.feedCursor.updateMany({ where: { sourceService: source, generation: expected.generation, cursor: expected.cursor },
            data: { cursor: next, generation: { increment: 1 } } });
          if (changed.count !== 1) return { committed: false, inserted: 0 };
          const added = await tx.observedEvent.createMany({ data: events.map(event => ({ sourceService: source, sourceEventId: event.source_event_id,
            schemaVersion: event.schema_version, occurredAt: new Date(event.occurred_at.value), snapshot: event as any })), skipDuplicates: true });
          return { committed: true, inserted: added.count };
        });
      },
    } });
    expect(pulled.complete && !pulled.concurrent).toBe(true);
    const persistedService = await db.observedEvent.findUnique({ where: { sourceService_sourceEventId: { sourceService: "hmrc", sourceEventId: serviceEvent.source_event_id } } });
    expect(Boolean(persistedService)).toBe(true);
    expect((persistedService!.snapshot as any).correlation.session_id.value === hash("session", binding.session_id)).toBe(true);
    await post("bindings", { attempt_id: attempt.id, source_service: "hmrc", source_event_id: serviceEvent.source_event_id, effect_class: "REQUEST_ONLY" });
    const ledgerSession = await db.researchSession.findUnique({ where: { id: binding.session_id } });
    expect(ledgerSession?.attemptId === attempt.id).toBe(true);
    const savedAttempt = await db.researchAttempt.findUnique({ where: { id: attempt.id } });
    expect(savedAttempt?.status).toBe("UNLABELLED");
    expect(savedAttempt?.executionClass).toBeNull();
    const attached = await db.researchBinding.findMany({ where: { attemptId: attempt.id } });
    expect(attached.length === 3 && attached.filter(b => b.eventKind === "service_request").length === 1).toBe(true);
  } finally { await db.$disconnect(); }
});

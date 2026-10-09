import { expect, test } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { SignJWT } from "jose";

test("ordinary HMRC and uncovered research pages send no Fingerprint requests", async ({ page, request }) => {
  const missing = process.env.FINGERPRINT_EXPECT_MISSING === "true";
  const vendorRequests: string[] = [];
  page.on("request", r => { if (/fpjs\.io|fingerprint\.com|fpcdn\.io/.test(r.url())) vendorRequests.push(r.url()); });
  await page.goto("http://localhost:3302/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("http://localhost:3302/research/device-intelligence");
  await expect(page.getByText(missing ? "The public vendor key is missing." : "The study is switched off.", { exact: false })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(missing ? "missing" : "not_run");
  await expect(page.getByRole("button", { name: "Join device study" })).toHaveCount(0);
  const result = await request.post("http://localhost:3302/api/research/fingerprint/enrol", { headers: { origin: "http://localhost:3302" }, data: { consent: true } });
  expect(result.status()).toBe(missing ? 503 : 404);
  expect(vendorRequests).toEqual([]);
});

if (process.env.FINGERPRINT_EXPECT_MISSING === "true") {
  test("a signed research binding correlates actual HMRC request evidence without trusting caller tags", async ({ request }) => {
    // Trusted synthetic test signer only; this does not enrol or label a person.
    const session_id = randomUUID(), run_id = randomUUID(), nonce = randomUUID();
    const token = await new SignJWT({ typ: "fingerprint-research", session_id, run_id, attempt_id: randomUUID(), nonce,
      issued_at: Date.now(), expires_at: new Date(Date.now() + 60_000).toISOString() })
      .setProtectedHeader({ alg: "HS256" }).setIssuer("hmrc-fingerprint-research").setIssuedAt().setExpirationTime("1m")
      .sign(new TextEncoder().encode("dev-only-hmrc-session-secret-change-me-0123456789"));
    const response = await request.get("http://localhost:3302/api/tax-code", { headers: { cookie: `hmrc_fingerprint_research=${token}`, "x-run-tag": "caller-selected-run" } });
    expect(response.status()).toBeGreaterThanOrEqual(400); // No citizen/agent authority was supplied.
    const feed = await request.get("http://localhost:3302/api/research/events?limit=200", { headers: { authorization: "Bearer ci-fingerprint-feed-key" } });
    expect(feed.ok()).toBe(true);
    const event = (await feed.json()).events.find((e: { run_id: { value: string } }) => e.run_id.value === run_id);
    expect(event).toBeTruthy();
    expect(event.correlation.session_id.value).toBe(createHmac("sha256", "ci-fingerprint-project-hmac-key-at-least-32-characters").update(`hmrc:session:${session_id}`).digest("hex"));
    expect(event.browser_sensor.status).toBe("missing");
    expect(JSON.stringify(event)).not.toMatch(/caller-selected-run|actor_class|ground_truth|visitor_id/);
  });
}

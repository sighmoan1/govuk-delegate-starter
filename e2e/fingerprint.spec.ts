import { expect, test } from "@playwright/test";

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

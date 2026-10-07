import { test, expect } from "@playwright/test";

// The mock HMRC service on its own: a person's journey through the real One
// Login simulator, the internal operations view, and the challenge page.
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";

test("a person signs in, claims relief herself, and the claim is attributed to her", async ({ page }) => {
  await page.goto(`${HMRC}/`);
  await expect(page.getByRole("heading", { name: "Claim tax relief for your job expenses" })).toBeVisible();
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page).toHaveURL(/localhost:3301\/sign-in/);
  // A fresh person each run, so this test does not depend on what the demo test did to Sam.
  await page.getByLabel("Email address").fill(`e2e-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Your tax" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.locator("dl.summary-list")).toContainText("1257L");

  await page.getByRole("link", { name: "Claim tax relief for working from home" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // without confirming
  await expect(page.locator(".error-summary")).toContainText("There is a problem");
  await page.getByLabel(/My employer required me to work from home/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check your answers" })).toBeVisible();
  await page.getByRole("button", { name: "Submit claim" }).click();
  await expect(page.getByRole("heading", { name: "Claim received" })).toBeVisible();
  await expect(page.locator("ul.claims")).toContainText("Submitted by you");
  await expect(page.locator("dl.summary-list")).toContainText("1288L");
});

test("operations view shows traffic by lane and the lane policy", async ({ page }) => {
  await page.goto(`${HMRC}/ops`);
  await expect(page.getByRole("heading", { name: "Traffic by lane" })).toBeVisible();
  await expect(page.locator("table.lane-key")).toContainText("Not identified");
  await expect(page.locator("table.lane-key")).toContainText("checked with GOV.UK Delegate per request");
});

test("anonymous hammering of a signed-in page meets the challenge page; a person can pass it", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250)}` });
  let sawChallenge = false;
  for (let i = 0; i < 8 && !sawChallenge; i++) {
    const res = await page.request.get(`${HMRC}/your-tax`, { maxRedirects: 0 });
    sawChallenge = (res.headers()["location"] ?? "").includes("/challenge");
  }
  expect(sawChallenge).toBe(true);
  await page.goto(`${HMRC}/challenge?returnTo=/your-tax`);
  await expect(page.getByRole("heading", { name: "Before you continue" })).toBeVisible();
  await page.getByLabel("I am a person using this service for myself").check();
  await page.getByRole("button", { name: "Continue" }).click();
  // Passed the challenge: now just asked to sign in, like anyone else.
  await expect(page).toHaveURL(/localhost:3301\/sign-in/);
});

test("reflow at 320px on HMRC pages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/", "/ops", "/challenge"]) {
    await page.goto(`${HMRC}${path}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

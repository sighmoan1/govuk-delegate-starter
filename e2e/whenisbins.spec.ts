import { test, expect, type Page } from "@playwright/test";
const BINS = process.env.WHENISBINS_URL ?? "http://127.0.0.1:5710";
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:5700";
const ONELOGIN = process.env.ONELOGIN_URL ?? "http://localhost:5701";

test.beforeAll(async ({ request }) => { const health = await request.get(`${BINS}/health`); expect(health.ok()).toBeTruthy(); expect((await health.json()).mode).toBe("fixture"); });

async function prepare(page: Page, journey: "lookup" | "email" | "schedule") {
  await page.goto(BINS);
  await expect(page.getByRole("heading", { name: "Bin collections with your assistant" })).toBeVisible();
  await page.locator(`form[action="/demo/prepare"]`).filter({ has: page.locator(`input[name="journey"][value="${journey}"]`) }).getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Your assistant is waiting" })).toBeVisible();
  const consent = await page.getByRole("link", { name: "Review permissions" }).getAttribute("href");
  expect(consent).toBeTruthy();
  await page.goto(consent!);
  await page.waitForURL(url => url.origin === new URL(ONELOGIN).origin || url.pathname.includes("consent"));
  if (new URL(page.url()).origin === new URL(ONELOGIN).origin) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Personal assistant wants to act for you" })).toBeVisible();
  const boxes = page.locator('input[type="checkbox"][name="c"]');
  expect(await boxes.count()).toBeGreaterThan(0);
  for (const box of await boxes.all()) { await expect(box).not.toBeChecked(); await box.check(); }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check what you are allowing" })).toBeVisible();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agent authorised" })).toBeVisible();
  const authority = await page.getByRole("link", { name: "View this authority" }).getAttribute("href");
  await page.goto(`${BINS}/demo/status`);
  return new URL(authority!, DELEGATE).href;
}
async function action(page: Page, path: string) {
  await page.locator(`form[action="${path}"]`).getByRole("button").click();
}
async function approveAction(page: Page) {
  const link = page.getByRole("link", { name: "Approve this action" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("button", { name: /Approve|Allow/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Approve|Allow/ }).first().click();
  await page.goto(`${BINS}/demo/status`);
}
async function revoke(page: Page, authority: string) {
  await page.goto(authority);
  await page.getByRole("link", { name: /Remove access/ }).click();
  await page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
  await page.goto(`${BINS}/demo/status`);
}

test("one-off lookup uses real citizen consent, outcome, revocation and subsequent refusal", async ({ page }) => {
  const authority = await prepare(page, "lookup");
  await action(page, "/demo/act");
  await expect(page.locator("main")).toContainText('"ALLOW"');
  await expect(page.locator("main")).toContainText('"done"');
  await revoke(page, authority);
  await action(page, "/demo/act");
  await expect(page.locator("main")).toContainText("AUTHORISATION_REVOKED");
});
test("email signup requires exact approval, simulated inbox confirmation and separate cancellation", async ({ page }) => {
  await prepare(page, "email");
  await action(page, "/demo/act");
  await expect(page.locator("main")).toContainText("STEP_UP_REQUIRED");
  await approveAction(page);
  await action(page, "/demo/act");
  await expect(page.locator("main")).toContainText("confirmation_required");
  await action(page, "/demo/mailbox-confirm");
  await expect(page.locator("main")).toContainText("confirmed");
  await action(page, "/demo/cancel");
  await expect(page.locator("main")).toContainText("STEP_UP_REQUIRED");
  await approveAction(page);
  await action(page, "/demo/cancel");
  await expect(page.locator("main")).toContainText("confirmed");
});
test("scheduled executions are distinct, survive controls and cease on real authority revocation", async ({ page }) => {
  const authority = await prepare(page, "schedule");
  await page.getByRole("checkbox", { name: "I agree to this bounded weekly schedule" }).check();
  await action(page, "/demo/schedule");
  await action(page, "/demo/tick");
  await expect(page.locator("main")).toContainText("completed");
  await action(page, "/demo/pause");
  await expect(page.locator("main")).toContainText("paused");
  await action(page, "/demo/resume");
  await expect(page.locator("main")).toContainText("active");
  await action(page, "/demo/tick");
  await expect(page.locator("main")).toContainText('"occurrences": 2');
  await revoke(page, authority);
  await action(page, "/demo/tick");
  await expect(page.locator("main")).toContainText("authority-refused");
  await expect(page.locator("main")).toContainText("AUTHORISATION_REVOKED");
  await action(page, "/demo/stop");
  await expect(page.locator("main")).toContainText("stopped");
});
test("portal keeps synthetic/private boundaries, keyboard access and 320px reflow", async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(BINS);
  await expect(page.locator("main")).toContainText(/synthetic|fixture/i);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const rejected = await request.post(`${BINS}/demo/prepare`, { headers: { origin: "https://other.example" }, form: { journey: "lookup" } });
  expect(rejected.status()).toBe(403);
});

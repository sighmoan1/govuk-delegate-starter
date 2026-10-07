import { test, expect, type Page } from "@playwright/test";

// GOV.UK Delegate on its own: consent through the real One Login simulator,
// then the account page and the internal operations view.
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:3300";
const CLIENT_ID = process.env.DEMO_AGENT_CLIENT_ID ?? "demo-personal-agent";
const CLIENT_SECRET = process.env.DEMO_AGENT_CLIENT_SECRET ?? "dev-demo-agent-secret";

async function signInIfAsked(page: Page, email?: string) {
  if (!/localhost:3301/.test(page.url())) return;
  if (email) await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click(); // email
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // password
}

async function createRequest() {
  const tok = await (await fetch(`${DELEGATE}/api/agent/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  })).json();
  const res = await fetch(`${DELEGATE}/api/authorisation-requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tok.access_token}` },
    body: JSON.stringify({ service: "hmrc-personal-tax", capabilities: ["view_tax_code", "claim_job_expenses", "update_employment"] }),
  });
  return (await res.json()) as { id: string; consent_url: string };
}

test("consent: sign in with One Login, narrow the request, allow; then remove access", async ({ page }) => {
  const req = await createRequest();

  await page.goto(req.consent_url);
  await expect(page).toHaveURL(/localhost:3301\/sign-in/);
  await signInIfAsked(page);

  await expect(page.getByRole("heading", { level: 1, name: "Example AI wants to act for you" })).toBeVisible();
  await page.getByLabel(/Update your employment details/).uncheck();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check what you are allowing" })).toBeVisible();
  await expect(page.getByText("Not allowed to")).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("heading", { name: "Agent authorised" })).toBeVisible();

  await page.goto(`${DELEGATE}/account/delegates`);
  await expect(page.getByRole("heading", { name: "Who can act for you" })).toBeVisible();
  await page.getByRole("link", { name: /Remove access/ }).first().click();
  await page.getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
});

test("Delegate has no front page of its own: the root goes to the account", async ({ page }) => {
  await page.goto(`${DELEGATE}/`);
  await expect(page).toHaveURL(/localhost:3301\/sign-in|\/account\/delegates/);
});

test("internal operations view lists agent checks", async ({ page }) => {
  await page.goto(`${DELEGATE}/ops`);
  await expect(page.getByRole("heading", { name: "Agent activity" })).toBeVisible();
  await expect(page.locator("table.activity-table")).toBeVisible();
});

test("keyboard: skip link is first focusable", async ({ page }) => {
  await page.goto(`${DELEGATE}/ops`);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("reflow at 320px: no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const req = await createRequest();
  await page.goto(req.consent_url);
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { level: 1, name: "Example AI wants to act for you" })).toBeVisible();
  for (const url of [req.consent_url, `${DELEGATE}/account/delegates`, `${DELEGATE}/ops`]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

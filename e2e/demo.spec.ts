import { test, expect, type Page } from "@playwright/test";

// The whole demo across the four systems, as the visitor (Sam) does it.
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:3300";
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
const AGENT = process.env.AGENT_URL ?? "http://localhost:3303";

async function signInIfAsked(page: Page) {
  if (await page.getByRole("button", { name: "Continue to sign in" }).count()) await page.getByRole("button", { name: "Continue to sign in" }).click();
  if (/localhost:3301/.test(page.url())) await page.getByRole("button", { name: /continue/i }).click();
}

test("seven steps: HMRC → agent → Delegate consent → agent acts → flood → revoke → HMRC attribution", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. HMRC, as Sam: an ordinary One Login relying party.
  await page.goto(HMRC);
  await page.getByRole("button", { name: "Start now" }).click();
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { name: "Your tax" })).toBeVisible();
  await expect(page.locator("dl.summary-list")).toContainText("1257L");
  await page.getByRole("link", { name: "Try Example AI" }).click();

  // 2. Example AI runs the task: signs in to Delegate as itself, asks for permission, waits.
  await expect(page).toHaveURL(new RegExp(AGENT));
  await page.getByRole("button", { name: /^Run/ }).click();
  const log = page.getByRole("list", { name: "Steps" });
  await expect(log).toContainText("Sign in to GOV.UK Delegate as Example AI");
  await expect(log).toContainText("Waiting for Sam");

  // 3. Delegate: consent. Sam narrows the request and allows.
  await page.getByRole("link", { name: "Give permission on GOV.UK" }).click();
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { level: 1, name: "Example AI assistant wants to act for you" })).toBeVisible();
  await page.getByLabel(/Update your employment details/).uncheck();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Allow" }).click();

  // 4. Back at the agent, which carries on by itself.
  await expect(page).toHaveURL(new RegExp(AGENT));
  await expect(log).toContainText("Sam gave permission on GOV.UK");
  await expect(log).toContainText("tax code is 1257L");
  await expect(log).toContainText("New tax code 1288L");
  await page.getByRole("button", { name: /Try something Sam didn’t allow/ }).click();
  await expect(log).toContainText("Sam did not allow Example AI to change refund bank account");

  // 5. Flood: unregistered bot vs registered agent.
  await page.goto(`${AGENT}/flood`);
  await page.getByRole("button", { name: "Send 40 as the bot" }).click();
  await expect(page.locator("#results")).toContainText("429 throttled", { timeout: 60_000 });
  await page.getByRole("button", { name: "Send 40 as Example AI" }).click();
  await expect(page.locator("#results")).toContainText("40 × 200 allowed", { timeout: 60_000 });
  await page.goto(`${HMRC}/ops`);
  await expect(page.getByRole("heading", { name: "Last 60 seconds" })).toBeVisible();

  // 6. Delegate: Sam removes access; the agent's next attempt is refused.
  await page.goto(`${DELEGATE}/account/delegates`);
  await page.getByRole("link", { name: /Remove access/ }).first().click();
  await page.getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
  await page.goto(AGENT);
  await page.getByRole("button", { name: "Check Sam’s tax code again" }).click();
  await expect(log).toContainText("Sam has removed Example AI’s access");

  // 7. HMRC, as Sam: the claim is there, attributed to the agent.
  await page.goto(`${HMRC}/your-tax`);
  await signInIfAsked(page);
  await expect(page.locator("ul.claims")).toContainText("Submitted by Example AI assistant on your behalf");
  await expect(page.locator("dl.summary-list")).toContainText("1288L");
});

test("the unregistered bot gets nowhere", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${AGENT}/bot`);
  await page.getByRole("button", { name: "Run as the unregistered bot" }).click();
  const log = page.getByRole("list", { name: "Bot steps" });
  // Within a minute of another flood every API call may already be throttled,
  // so assert what always holds: throttling, the challenge, and no result.
  await expect(log).toContainText("Nothing achieved", { timeout: 60_000 });
  await expect(log).toContainText("Throttled");
  await expect(log).toContainText("challenge page");
});

test("reflow at 320px on the agent's pages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/", "/bot", "/flood"]) {
    await page.goto(`${AGENT}${path}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

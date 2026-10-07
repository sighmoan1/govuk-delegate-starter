import { test, expect } from "@playwright/test";

// The demo as a first-time visitor sees it: you are Sam, the agent acts by itself.
// Run with the app in AGENT_MODE=scripted for deterministic agent replies.

test("Sam asks the agent → consents on GOV.UK → agent acts → refused → Sam removes access → refused → HMRC view", async ({ page }) => {
  const chat = page.getByRole("list", { name: "Conversation" });

  // 1. In the agent's app, Sam asks for help.
  await page.goto("/example-ai");
  await page.getByRole("button", { name: "Can you claim my working-from-home tax relief?" }).click();
  await expect(page.getByRole("heading", { name: "Permission needed from GOV.UK" })).toBeVisible();

  // 2. GOV.UK: a plain-English interstitial, then the real One Login simulator.
  await page.getByRole("link", { name: "Give permission on GOV.UK" }).click();
  await expect(page.getByRole("heading", { name: "Sign in with GOV.UK One Login" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await expect(page).toHaveURL(/localhost:3301\/authorize/);
  await page.getByRole("button", { name: /continue/i }).click();

  // 3. The consent screen: Sam narrows what the agent asked for, then allows.
  await expect(page.getByRole("heading", { level: 1, name: "Example AI assistant wants to act for you" })).toBeVisible();
  await page.getByLabel(/Update your employment details/).uncheck();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check what you are allowing" })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();

  // 4. Straight back to the agent, which carries on without being asked again.
  await expect(page).toHaveURL(/\/example-ai/);
  await expect(chat).toContainText("You gave Example AI assistant permission on GOV.UK");
  await expect(chat).toContainText("1288L");

  // 5. Something Sam never allowed: HMRC refuses.
  await page.getByRole("button", { name: "Also change my refund bank account to my new bank" }).click();
  await expect(chat).toContainText("haven’t given me permission to change the bank account for refunds");

  // 6. Sam removes access in their GOV.UK account.
  await page.getByRole("link", { name: "Manage who can act for you on GOV.UK" }).click();
  await expect(page.getByRole("heading", { name: "Who can act for you" })).toBeVisible();
  await page.getByRole("link", { name: /Remove access/ }).click();
  await expect(page.getByRole("heading", { name: /Remove Example AI assistant’s access\?/ })).toBeVisible();
  await page.getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();

  // 7. The same agent is refused now, server-side.
  await page.getByRole("contentinfo").getByRole("link", { name: /Example AI assistant/ }).click();
  await page.getByRole("button", { name: "What’s my tax code now?" }).click();
  await expect(chat).toContainText("you’ve removed my access");

  // 8. HMRC's service team sees every attempt from this session.
  await page.goto("/operator/activity");
  const session = page.locator("#session table");
  for (const reason of ["VALID_AUTHORISATION", "PERMISSION_MISSING", "AUTHORISATION_REVOKED"]) {
    await expect(session.getByText(reason).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Send an unidentified request" }).click();
  await expect(page.getByRole("status")).toContainText("HTTP 401");
  await expect(session.getByText("Not identified").first()).toBeVisible();
});

test("the agent page never shows Sam's GOV.UK session", async ({ page }) => {
  await page.goto("/example-ai");
  await expect(page.getByText("Signed in to GOV.UK as")).toHaveCount(0);
});

test("about page explains the proposition and the platform model", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByText("make legitimate automation easier than illegitimate automation", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A platform, like One Login" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accessibility and inclusion" })).toBeVisible();
});

test("keyboard: skip link is first focusable", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("reflow at 320px: no horizontal page scroll on key pages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/", "/about", "/example-ai", "/operator/activity", "/consent-signin"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

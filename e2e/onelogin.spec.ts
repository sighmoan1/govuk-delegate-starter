import { test, expect } from "@playwright/test";

// The One Login sign-in screens in front of the official simulator.
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
const ONELOGIN = process.env.ONELOGIN_URL ?? "http://localhost:3301";

test("an email in the wrong format is caught, then sign-in completes", async ({ page }) => {
  await page.goto(`${HMRC}/auth/login?returnTo=/your-tax`);
  await expect(page.getByRole("heading", { name: /Enter your email address/ })).toBeVisible();
  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".ol-error-summary")).toContainText("Enter an email address in the correct format");
  await page.getByLabel("Email address").fill("sam.taylor@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Signing in as sam.taylor@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tax" })).toBeVisible();
});

test("OIDC discovery and keys still come from the official simulator", async ({ request }) => {
  const d = await (await request.get(`${ONELOGIN}/.well-known/openid-configuration`)).json();
  expect(d.issuer).toBe(`${ONELOGIN}/`);
  expect(d.token_endpoint).toBe(`${ONELOGIN}/token`);
  const jwks = await (await request.get(`${ONELOGIN}/.well-known/jwks.json`)).json();
  expect(jwks.keys.length).toBeGreaterThan(0);
});

test("a sign-in page without a pending request says to start again", async ({ page }) => {
  await page.goto(`${ONELOGIN}/sign-in`);
  await expect(page.getByRole("heading", { name: "You need to start again" })).toBeVisible();
});

test("reflow at 320px on the sign-in screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${HMRC}/auth/login?returnTo=/your-tax`);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

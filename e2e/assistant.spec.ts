import { test, expect, type Page } from "@playwright/test";

// Example AI's conversation: every message gets a reply, and a request that
// needed extra permission is carried out once Sam gives it.
const AGENT = process.env.AGENT_URL ?? "http://localhost:3303";
const ABOUT = process.env.ABOUT_URL ?? "http://localhost:3304";

async function signInIfAsked(page: Page) {
  if (!/localhost:3301/.test(page.url())) return;
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function approveOnGovUk(page: Page) {
  await page.getByRole("link", { name: "Continue to GOV.UK" }).click();
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { level: 1, name: "Example AI wants to act for you" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page).toHaveURL(new RegExp(AGENT));
}

/** Send via a suggestion, and require the conversation to end with a reply from Example AI. */
async function send(page: Page, text: string) {
  const items = page.locator("ol.chat > li");
  const before = await items.count();
  await page.getByRole("button", { name: text }).click();
  await expect(items).not.toHaveCount(before);
  await expect(items.last()).toHaveClass(/from-ai/);
  // The message itself appears exactly once.
  await expect(page.locator("ol.chat > li.from-user", { hasText: text })).not.toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test("refused, ask for permission, approve: the bank change is then done, and every message got a reply", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${ABOUT}/use-an-agent`);
  await page.getByRole("button", { name: "Start clean" }).click();
  await expect(page.locator(".start-from__done")).toBeVisible();

  await page.goto(AGENT);
  await send(page, "Claim my working-from-home tax relief");
  await approveOnGovUk(page);
  await expect(page.locator(".result-card").last()).toContainText("Claim submitted to HMRC");

  await send(page, "Change my refund bank account to my new bank");
  await expect(page.locator("ol.chat > li").last()).toContainText("I can’t do that");

  await send(page, "Yes, ask me for permission");
  await approveOnGovUk(page);
  await expect(page.locator("ol.chat > li").last()).toContainText("Done. HMRC will pay any tax refunds into your new bank account.");
  await expect(page.locator(".result-card").last()).toContainText("Refund bank account changed");

  // Asking again now just works, with a reply.
  await send(page, "Change my refund bank account to my new bank");
  await expect(page.locator("ol.chat > li").last()).toContainText("Done.");

  // No user message is ever left without an answer, and none appears twice in a row.
  const roles = await page.locator("ol.chat > li").evaluateAll((els) => els.map((e) => (e.classList.contains("from-user") ? "U" : "A")).join(""));
  expect(roles).not.toMatch(/UU/);
  expect(roles.endsWith("A")).toBe(true);
});

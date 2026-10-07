import { test, expect } from "@playwright/test";

// Real-model smoke test. Runs only when the app was started with ANTHROPIC_API_KEY
// (and without AGENT_MODE=scripted). It spends a few cents.
test("live agent asks for permission, then reports the claim after consent", async ({ page }) => {
  await page.goto("/example-ai");
  test.skip(!(await page.getByText(/Live agent/).count()), "App is running the scripted agent (no ANTHROPIC_API_KEY)");
  test.setTimeout(240_000);

  await page.getByRole("button", { name: "Can you claim my working-from-home tax relief?" }).click();
  await expect(page.getByRole("link", { name: "Give permission on GOV.UK" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("link", { name: "Give permission on GOV.UK" }).click();
  if (await page.getByRole("button", { name: "Continue to sign in" }).count()) {
    await page.getByRole("button", { name: "Continue to sign in" }).click();
    await page.getByRole("button", { name: /continue/i }).click();
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Allow" }).click();
  const chat = page.getByRole("list", { name: "Conversation" });
  await expect(chat.getByText("Claim working-from-home relief")).toBeVisible({ timeout: 120_000 });
  await expect(chat).toContainText("1288L");
});

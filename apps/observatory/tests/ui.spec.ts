import { expect, test } from "@playwright/test";

test("research scope stays explicit and usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Understand automated service activity");
  await expect(page.getByRole("note")).toContainText("no study results yet");
  await expect(page.getByText("Not connected. No HMRC or Delegate events are collected.")).toBeVisible();
  await expect(page.getByText("Not implemented. No automation scores or measured performance.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.screenshot({ path: "ci-artifacts/observatory-320.png", fullPage: true });
});

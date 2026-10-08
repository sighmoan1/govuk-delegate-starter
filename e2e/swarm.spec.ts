import { test, expect } from "@playwright/test";

// Scenario 5, driven from the about site: the same workload four ways, through
// HMRC's real API and GOV.UK Delegate.
const ABOUT = process.env.ABOUT_URL ?? "http://localhost:3304";

test("a swarm doesn't beat the system: A, B and B′ match; C gets N times as much", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(`${ABOUT}/swarm`);
  await page.getByLabel("Size of the swarm (N)").selectOption("50");
  await page.getByRole("button", { name: "Run all four" }).click();

  await expect(page.getByRole("heading", { name: "Results, with N = 50" })).toBeVisible({ timeout: 200_000 });
  await expect(page.locator("#results .lead")).toContainText("exactly the same");
  await expect(page.locator("#results .lead")).toContainText("1 claim accepted and 50 tax-code views"); // 50 is under the hourly limit
  await expect(page.locator("#results .lead")).toContainText("C, with 50 separate people, got 50 claims");

  // The chart has a table view with the same numbers.
  await page.locator("#claims").getByText("Show as a table").click();
  const rows = page.locator("#claims .viz-table tbody tr");
  await expect(rows).toHaveCount(4);
  for (const i of [0, 1, 2]) await expect(rows.nth(i).locator("td").nth(0)).toHaveText("1"); // accepted
  await expect(rows.nth(3).locator("td").nth(0)).toHaveText("50");
  // Nothing ended in a failure.
  for (const i of [0, 1, 2, 3]) await expect(rows.nth(i).locator("td").nth(3)).toHaveText("0");

  await expect(page.locator("#claims svg")).toHaveAttribute("aria-label", /A: 1 accepted of 50.*C: 50 accepted of 50/);

  // At 320px the page doesn't scroll sideways (the chart scrolls inside its own box).
  await page.setViewportSize({ width: 320, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

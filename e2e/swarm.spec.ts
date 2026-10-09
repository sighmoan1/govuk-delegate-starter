import { test, expect } from "@playwright/test";

// Scenario 4, driven from the about site: seven ways of sending the same wish, through HMRC's real API, GOV.UK
// Delegate's check, a real queue and a real worker, plus a labelled simulation of the protections. The details of
// what each scenario must show are asserted in tests/swarm.test.ts; this checks that the page tells it, apart.
const ABOUT = process.env.ABOUT_URL ?? "http://localhost:3304";

test("the swarm page keeps technical load apart from service outcomes, and labels what is measured and what is simulated", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(`${ABOUT}/swarm`);

  // Before running anything: the labels, and the simulation (which needs no services).
  await expect(page.getByRole("heading", { name: "How to read the labels" })).toBeVisible();
  await expect(page.getByText("Measured: real integration run").first()).toBeVisible();
  await expect(page.getByText("Depends on a demo-only limit").first()).toBeVisible();
  await expect(page.getByText("Simulated, not measured").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Which protections keep the legitimate demand/ })).toBeVisible();

  await page.getByLabel("Size of the swarm (N)").selectOption("10");
  await page.getByRole("button", { name: "Run all seven" }).click();

  await expect(page.getByRole("heading", { name: "Results, with N = 10" })).toBeVisible({ timeout: 250_000 });
  await expect(page.locator("#results .lead")).toContainText("stayed one claim");
  await expect(page.locator("#results .lead")).toContainText("10 different people made 10");

  // Two separate tables: what happened to the claims, and what it cost.
  await expect(page.getByRole("heading", { name: "Service outcomes: what happened to the claims" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Technical load: what it cost" })).toBeVisible();
  const outcomes = page.locator("table").filter({ has: page.locator("caption", { hasText: "Service outcomes by scenario" }) });
  const rows = outcomes.locator("tbody tr");
  await expect(rows).toHaveCount(7);
  // Claims wanted / received / recorded: one for A, B and B′, ten for C, eleven for D (ten people and a bystander).
  for (const [i, wanted] of [[0, "1"], [1, "1"], [2, "1"], [3, "10"], [4, "11"], [5, "1"], [6, "2"]] as const) {
    const cells = rows.nth(i).locator("td");
    await expect(cells.nth(0)).toHaveText(wanted);
    await expect(cells.nth(1)).toHaveText(wanted); // received
    await expect(cells.nth(2)).toHaveText(wanted); // recorded
    await expect(cells.nth(3)).toHaveText("0"); // nothing left waiting or failed
  }

  // The request chart has a table view with the same numbers, and says that requests are not claims.
  await expect(page.locator("#attempts figcaption")).toContainText("Requests are not claims");
  await page.locator("#attempts").getByText("Show as a table").click();
  await expect(page.locator("#attempts .viz-table tbody tr")).toHaveCount(7);

  // Every check the run made held.
  await expect(page.locator("#results .inset-text")).toHaveCount(0);

  // At 320px the page doesn't scroll sideways (tables and charts scroll inside their own boxes).
  await page.setViewportSize({ width: 320, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

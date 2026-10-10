import { expect, test } from "@playwright/test";
test("private connector evidence can be inspected by keyboard at 320px without persisting the key", async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 800 });
 await page.route("**/api/monitoring/whenisbins", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ source: "whenisbins_connector", counts: { source_events: 1 }, limitations: "Source reports only", events: [{ pseudonym: "a".repeat(64) }] }) }));
 await page.goto("/whenisbins"); await page.getByLabel("Research collection key").fill("synthetic-key-do-not-save"); await page.getByLabel("Research collection key").press("Tab"); await expect(page.getByRole("button", { name: "Read connector evidence" })).toBeFocused(); await page.keyboard.press("Enter"); await expect(page.getByRole("region", { name: "Connector evidence" })).toContainText("Source reports only");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain("synthetic-key"); expect(page.url()).not.toContain("synthetic-key");
});
test("failure remains explicit rather than rendering invented counts", async ({ page }) => {
 await page.route("**/api/monitoring/whenisbins", route => route.fulfill({ status: 503, body: "unavailable" })); await page.goto("/whenisbins"); await page.getByLabel("Research collection key").fill("synthetic-key"); await page.getByRole("button").click(); await expect(page.getByRole("status")).toContainText("Evidence is unavailable"); await expect(page.getByRole("region", { name: "Connector evidence" })).toHaveCount(0);
});

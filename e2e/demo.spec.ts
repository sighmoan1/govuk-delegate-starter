import { test, expect, type Page } from "@playwright/test";

// The demo exactly as the about site's script describes it, across all five apps.
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:3300";
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
const AGENT = process.env.AGENT_URL ?? "http://localhost:3303";
const ABOUT = process.env.ABOUT_URL ?? "http://localhost:3304";

async function signInIfAsked(page: Page) {
  if (/localhost:3301/.test(page.url())) await page.getByRole("button", { name: /continue/i }).click();
}

test("the seven steps on the about site's demo page", async ({ page }) => {
  test.setTimeout(180_000);
  const chat = page.getByRole("list", { name: "Conversation" });

  // 1. HMRC, as Sam.
  await page.goto(HMRC);
  await page.getByRole("button", { name: "Start now" }).click();
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { name: "Your tax" })).toBeVisible();
  await expect(page.locator("dl.summary-list")).toContainText("1257L");

  // 2. Sam asks her assistant, which needs permission.
  await page.goto(AGENT);
  await expect(page.getByRole("heading", { name: "Hi Sam. What can I help with?" })).toBeVisible();
  await page.getByRole("button", { name: "Claim my working-from-home tax relief" }).click();
  await expect(chat).toContainText("First I need your permission");

  // 3. GOV.UK: consent.
  await page.getByRole("link", { name: "Continue to GOV.UK" }).click();
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { level: 1, name: "Example AI wants to act for you" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Allow" }).click();

  // 4. The assistant does the job; then is refused something Sam never allowed.
  await expect(page).toHaveURL(new RegExp(AGENT));
  await expect(chat).toContainText("I’m connected to HMRC");
  await expect(page.locator(".result-card")).toContainText("1257L → 1288L");
  await expect(page.getByRole("link", { name: "Continue to GOV.UK" })).toHaveCount(0);
  await page.getByRole("button", { name: /Change my refund bank account/ }).click();
  await expect(chat).toContainText("You haven’t given me permission to change the bank account HMRC pays refunds into");

  // 5. Flood from the console.
  await page.goto(`${ABOUT}/console`);
  await page.getByRole("button", { name: "Send 40 as the bot" }).click();
  await expect(page.locator("#results")).toContainText("0 of 40 got the data", { timeout: 60_000 });
  await page.getByRole("button", { name: "Send 40 as Example AI" }).click();
  await expect(page.locator("#results")).toContainText("40 of 40 got the data", { timeout: 60_000 });
  await page.goto(`${HMRC}/ops`);
  await expect(page.locator("table.lanes").first()).toContainText("Authorised agent");

  // 6. Sam removes access; the assistant no longer has it.
  await page.goto(`${DELEGATE}/account/delegates`);
  await page.getByRole("link", { name: /Remove access/ }).first().click();
  await page.getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();
  await page.goto(AGENT);
  await page.getByRole("button", { name: "What’s my tax code?" }).click();
  await expect(chat).toContainText("I no longer have access to HMRC");

  // 7. HMRC shows the claim, attributed to the agent.
  await page.goto(`${HMRC}/your-tax`);
  await signInIfAsked(page);
  await expect(page.locator("ul.claims")).toContainText("Submitted by Example AI on your behalf");
  await expect(page.locator("dl.summary-list")).toContainText("1288L");
});

test("the four services carry no demo explanation; the about site does", async ({ page }) => {
  for (const url of [HMRC, `${HMRC}/ops`, AGENT, `${AGENT}/settings`, `${DELEGATE}/ops`]) {
    await page.goto(url);
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["prototype", "simulator", "synthetic", "demo"]) expect(text, `${url} mentions "${word}"`).not.toContain(word);
    await expect(page.getByRole("link", { name: "About this prototype" }).first()).toBeVisible();
  }
  await page.goto(ABOUT);
  await expect(page.getByText("Make legitimate automation easier than illegitimate automation.")).toBeVisible();
  for (const path of ["/demo", "/how-it-works", "/why", "/precedents", "/console"]) {
    await page.goto(`${ABOUT}${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("reflow at 320px on the assistant and the about site", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const url of [AGENT, `${AGENT}/settings`, ABOUT, `${ABOUT}/demo`, `${ABOUT}/how-it-works`, `${ABOUT}/console`]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

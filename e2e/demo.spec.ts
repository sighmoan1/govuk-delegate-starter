import { test, expect, type Page } from "@playwright/test";

// The scenarios on the about site, each started from its own reset
// button, so resetting from the UI is tested too.
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:3300";
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
const ABOUT = process.env.ABOUT_URL ?? "http://localhost:3304";

async function signInIfAsked(page: Page, email?: string) {
  // HMRC asks who you are first: sign in as yourself.
  if (new URL(page.url()).pathname === "/sign-in") await page.getByRole("button", { name: "Sign in with GOV.UK One Login" }).click();
  if (!/localhost:3301/.test(page.url())) return;
  if (email) await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click(); // email
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // password
}

async function startFrom(page: Page, path: string, button: "Start clean" | "Start with an agent already authorised") {
  await page.goto(`${ABOUT}${path}`);
  await page.getByRole("button", { name: button }).click();
  await expect(page.locator(".start-from__done")).toContainText("Reset.");
}

test.describe.configure({ mode: "serial" });

test("scenario 1: Sam manages who can act for her", async ({ page }) => {
  test.setTimeout(120_000);
  await startFrom(page, "/manage-who-can-act", "Start with an agent already authorised");

  await page.goto(`${DELEGATE}/account/delegates`);
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { name: "Who can act for you" })).toBeVisible();
  await expect(page.locator(".delegate-card").first()).toContainText("Personal assistant");
  await page.getByRole("link", { name: /^View/ }).first().click();
  await expect(page.getByRole("heading", { name: "What it has done for you" })).toBeVisible();
  await page.getByRole("link", { name: "Remove access" }).click();
  await page.getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();

  await page.goto(`${DELEGATE}/account/delegates`);
  await expect(page.locator(".delegate-card:not(.delegate-card--ended)")).toHaveCount(0);
});

test("scenario 2: government prioritises people and authorised agents", async ({ page }) => {
  test.setTimeout(120_000);
  await startFrom(page, "/prioritise-trusted-traffic", "Start clean");

  await page.getByRole("button", { name: "Send 40 requests as a bot" }).click();
  await expect(page.locator("#results")).toContainText("0 of 40 got the data", { timeout: 60_000 });
  await page.getByRole("button", { name: "Load the page 10 times" }).click();
  await expect(page.locator("#results")).toContainText("Sent to the “Before you continue” check", { timeout: 60_000 });

  await page.goto(`${HMRC}/ops`);
  await expect(page.locator("table.lanes").first()).toContainText("Authorised agent");
});

test("reset everything from the overview", async ({ page }) => {
  await page.goto(ABOUT);
  await page.getByRole("button", { name: "Reset everything" }).click();
  await expect(page.locator(".start-from__done")).toContainText("Everything is back to the start");
  await page.goto(`${DELEGATE}/account/delegates`);
  await signInIfAsked(page);
  await expect(page.locator(".delegate-card:not(.delegate-card--ended)")).toHaveCount(0);
});

test("the services carry no demo explanation; the about site does", async ({ page }) => {
  for (const url of [HMRC, `${HMRC}/ops`, `${DELEGATE}/ops`]) {
    await page.goto(url);
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["prototype", "simulator", "synthetic", "demo", "scenario"]) expect(text, `${url} mentions "${word}"`).not.toContain(word);
    await expect(page.getByRole("link", { name: "About this prototype" }).first()).toBeVisible();
  }
  await page.goto(ABOUT);
  await expect(page.getByText("Make legitimate automation easier than illegitimate automation.")).toBeVisible();
  for (const path of ["/ask-your-agent", "/manage-who-can-act", "/prioritise-trusted-traffic", "/how-it-works", "/why", "/precedents"]) {
    await page.goto(`${ABOUT}${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto(`${ABOUT}/demo`);
  await expect(page).toHaveURL(`${ABOUT}/`);
});

test("reflow at 320px on the about site", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const url of [ABOUT, `${ABOUT}/ask-your-agent`, `${ABOUT}/manage-who-can-act`, `${ABOUT}/prioritise-trusted-traffic`, `${ABOUT}/which-route`, `${ABOUT}/swarm`, `${ABOUT}/sams-phone`, `${ABOUT}/how-it-works`]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

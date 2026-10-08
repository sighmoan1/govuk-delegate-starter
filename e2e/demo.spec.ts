import { test, expect, type Page } from "@playwright/test";

// The three scenarios on the about site, each started from its own reset
// button, so resetting from the UI is tested too.
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:3300";
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
const AGENT = process.env.AGENT_URL ?? "http://localhost:3303";
const ABOUT = process.env.ABOUT_URL ?? "http://localhost:3304";

async function signInIfAsked(page: Page, email?: string) {
  // HMRC asks who you are first: sign in as yourself.
  if (/localhost:3302\/sign-in/.test(page.url())) await page.getByRole("button", { name: "Sign in with GOV.UK One Login" }).click();
  if (!/localhost:3301/.test(page.url())) return;
  if (email) await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click(); // email
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // password
}

async function startFrom(page: Page, path: string, button: "Start clean" | "Start with Example AI already connected") {
  await page.goto(`${ABOUT}${path}`);
  await page.getByRole("button", { name: button }).click();
  await expect(page.locator(".start-from__done")).toContainText("Reset.");
}

test.describe.configure({ mode: "serial" });

test("scenario 1: Sam asks her assistant to claim tax relief", async ({ page }) => {
  test.setTimeout(120_000);
  await startFrom(page, "/use-an-agent", "Start clean");
  const chat = page.getByRole("list", { name: "Conversation" });

  await page.goto(AGENT);
  await expect(page.getByRole("heading", { name: "Hi Sam. What can I help with?" })).toBeVisible();
  await page.getByRole("button", { name: "Claim my working-from-home tax relief" }).click();
  await expect(chat).toContainText("First I need your permission");

  await page.getByRole("link", { name: "Continue to GOV.UK" }).click();
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { level: 1, name: "Example AI wants to act for you" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Allow" }).click();

  await expect(page).toHaveURL(new RegExp(AGENT));
  await expect(chat).toContainText("I’m connected to HMRC");
  await expect(page.locator(".result-card")).toContainText("1257L → 1288L");
  await page.getByRole("button", { name: /Change my refund bank account/ }).click();
  await expect(chat).toContainText("You haven’t given me permission to change the bank account HMRC pays refunds into");

  await page.goto(`${HMRC}/your-tax`);
  await signInIfAsked(page);
  await expect(page.locator("ul.claims")).toContainText("Submitted by Example AI on your behalf");
});

test("scenario 2: Sam manages who can act for her", async ({ page }) => {
  test.setTimeout(120_000);
  await startFrom(page, "/manage-who-can-act", "Start with Example AI already connected");

  await page.goto(`${DELEGATE}/account/delegates`);
  await signInIfAsked(page);
  await expect(page.getByRole("heading", { name: "Who can act for you" })).toBeVisible();
  await expect(page.locator(".delegate-card").first()).toContainText("Example AI");
  await page.getByRole("link", { name: /^View/ }).first().click();
  await expect(page.getByRole("heading", { name: "What it has done for you" })).toBeVisible();
  await page.getByRole("link", { name: "Remove access" }).click();
  await page.getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByRole("heading", { name: "Access removed" })).toBeVisible();

  await page.goto(AGENT);
  await page.getByRole("button", { name: "What’s my tax code?" }).click();
  await expect(page.getByRole("list", { name: "Conversation" })).toContainText("I no longer have access to HMRC");
  await expect(page.getByRole("button", { name: "Reconnect to HMRC" })).toBeVisible();
});

test("scenario 3: government prioritises people and authorised agents", async ({ page }) => {
  test.setTimeout(120_000);
  await startFrom(page, "/prioritise-trusted-traffic", "Start with Example AI already connected");

  await page.getByRole("button", { name: "Send 40 requests as a bot" }).click();
  await expect(page.locator("#results")).toContainText("0 of 40 got the data", { timeout: 60_000 });
  await page.getByRole("button", { name: "Send 40 requests as Example AI" }).click();
  await expect(page.locator("#results")).toContainText("40 of 40 got the data", { timeout: 60_000 });
  await page.getByRole("button", { name: "Load the page 10 times" }).click();
  await expect(page.locator("#results")).toContainText("Sent to the “Before you continue” check", { timeout: 60_000 });

  await page.goto(`${HMRC}/ops`);
  await expect(page.locator("table.lanes").first()).toContainText("Authorised agent");
});

test("reset everything from the overview", async ({ page }) => {
  await page.goto(ABOUT);
  await page.getByRole("button", { name: "Reset everything" }).click();
  await expect(page.locator(".start-from__done")).toContainText("Everything is back to the start");
  await page.goto(AGENT);
  await expect(page.getByRole("heading", { name: "Hi Sam. What can I help with?" })).toBeVisible();
  await page.goto(`${AGENT}/settings`);
  await expect(page.getByText("Not connected")).toBeVisible();
});

test("the four services carry no demo explanation; the about site does", async ({ page }) => {
  for (const url of [HMRC, `${HMRC}/ops`, AGENT, `${AGENT}/settings`, `${DELEGATE}/ops`]) {
    await page.goto(url);
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["prototype", "simulator", "synthetic", "demo", "scenario"]) expect(text, `${url} mentions "${word}"`).not.toContain(word);
    await expect(page.getByRole("link", { name: "About this prototype" }).first()).toBeVisible();
  }
  await page.goto(ABOUT);
  await expect(page.getByText("Make legitimate automation easier than illegitimate automation.")).toBeVisible();
  for (const path of ["/use-an-agent", "/manage-who-can-act", "/prioritise-trusted-traffic", "/how-it-works", "/why", "/precedents"]) {
    await page.goto(`${ABOUT}${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto(`${ABOUT}/demo`);
  await expect(page).toHaveURL(`${ABOUT}/`);
});

test("reflow at 320px on the assistant and the about site", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const url of [AGENT, `${AGENT}/settings`, ABOUT, `${ABOUT}/use-an-agent`, `${ABOUT}/manage-who-can-act`, `${ABOUT}/prioritise-trusted-traffic`, `${ABOUT}/which-route`, `${ABOUT}/swarm`, `${ABOUT}/sams-phone`, `${ABOUT}/how-it-works`]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

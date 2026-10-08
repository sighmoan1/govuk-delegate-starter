import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { signRequest, type Directory } from "../packages/web-bot-auth/src/index";
// Runs only against `npm run public`: `npm run test:public` loads .env.public.
const HMRC = process.env.HMRC_PUBLIC_URL!, DELEGATE = process.env.DELEGATE_PUBLIC_URL!, OL = process.env.ONELOGIN_PUBLIC_URL!;
test.skip(!process.env.HMRC_PUBLIC_URL, "public URLs not set (start them with npm run public)");
test.setTimeout(120_000);

test("public: a self-declared agent gets permission from Sam, through the tunnels", async ({ browser }) => {
  const actx = await browser.newContext(); const agent = await actx.newPage();
  await agent.goto(`${HMRC}/act-for-someone`);
  await agent.getByLabel("Name of the assistant or app").fill("Claude");
  await agent.getByLabel("Who provides it").fill("Anthropic");
  await agent.getByRole("button", { name: "Get a code" }).click();
  const code = (await agent.locator(".code-panel--big").innerText()).trim();
  await expect(agent.locator(".code-panel").first()).toContainText(`${DELEGATE}/approve`);

  const sctx = await browser.newContext(); const sam = await sctx.newPage();
  await sam.goto(`${DELEGATE}/approve?code=${code}`);
  await expect(sam).toHaveURL(new RegExp(`^${OL}`));
  await sam.getByRole("button", { name: "Continue" }).click();
  await expect(sam.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await sam.getByRole("button", { name: "Continue" }).click();
  await expect(sam.getByRole("heading", { level: 1 })).toContainText("wants to act for you");
  await sam.getByRole("button", { name: "Continue" }).click();
  await sam.getByRole("button", { name: "Allow" }).click();
  await expect(sam.getByRole("heading", { name: "Agent authorised" })).toBeVisible();

  await expect(agent.locator(".acting-banner")).toContainText("Claude is acting for this person", { timeout: 30_000 });
  await agent.getByRole("link", { name: "Claim tax relief for working from home" }).click();
  await agent.getByLabel(/My employer required me to work from home/).check();
  await agent.getByRole("button", { name: "Continue" }).click();
  await agent.getByRole("button", { name: "Submit claim" }).click();
  await expect(agent.locator("ul.claims")).toContainText("Submitted by Claude on your behalf");
});

test("public: Sam signs in to HMRC herself", async ({ page }) => {
  await page.goto(HMRC);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page).toHaveURL(new RegExp(`^${OL}/sign-in`));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`^${HMRC}/your-tax`));
});

test("public: demo tooling and simulator config are not reachable; test agent isn't trusted; discovery uses public URLs", async ({ request }) => {
  for (const u of [`${HMRC}/api/demo/reset`, `${HMRC}/api/demo/session`, `${DELEGATE}/api/demo/reset`, `${DELEGATE}/api/demo/principals`]) {
    const r = await request.post(u, { headers: { "x-demo-key": process.env.DEMO_CONSOLE_KEY! }, data: {} });
    expect(r.status(), u).toBe(404);
  }
  expect((await request.post(`${OL}/config`, { data: {} })).status()).toBe(404);
  const jwks = JSON.parse(readFileSync("dev/test-agent.jwks.json", "utf8")) as Directory;
  const key = { privateKeyPem: readFileSync("dev/test-agent-private.pem", "utf8"), keyid: jwks.keys[0].kid!, agent: "https://test-agent.local" };
  const u = new URL(`${HMRC}/api/tax-code`);
  const r = await request.get(u.toString(), { headers: signRequest({ method: "GET", authority: u.host, path: u.pathname }, key) });
  expect(r.headers()["x-trusted-lane"]).toBe("UNTRUSTED");
  const access = await (await request.get(`${HMRC}/.well-known/agent-access.json`)).json();
  expect(access.routes.browser_agents.start).toBe(`${HMRC}/act-for-someone`);
});

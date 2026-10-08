import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { signRequest, type Directory } from "../packages/web-bot-auth/src/index";
// Runs only against `npm run public`: `npm run test:public` loads .env.public.
const HMRC = process.env.HMRC_PUBLIC_URL!, DELEGATE = process.env.DELEGATE_PUBLIC_URL!, OL = process.env.ONELOGIN_PUBLIC_URL!;
test.skip(!process.env.HMRC_PUBLIC_URL, "public URLs not set (start them with npm run public)");
test.setTimeout(120_000);

// In public mode One Login is strict: the person needs a password and a code
// sent to her phone. Read them as Sam would, from the local-only demo endpoint.
const sam = async () => (await fetch("http://localhost:3301/api/demo/sam", { headers: { "x-demo-key": process.env.DEMO_CONSOLE_KEY! } })).json() as Promise<{ email: string; password: string; code: string | null }>;
async function signInAsSam(page: import("@playwright/test").Page) {
  const s = await sam();
  await page.getByLabel("Email address").fill(s.email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(s.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check your phone" })).toBeVisible();
  await page.getByLabel("Enter the 6 digit security code").fill((await sam()).code!);
  await page.getByRole("button", { name: "Continue" }).click();
}

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
  await signInAsSam(sam);
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
  await signInAsSam(page);
  await expect(page).toHaveURL(new RegExp(`^${HMRC}/your-tax`));
});

test("public: sign-in can't be done by clicking through: nothing pre-filled, wrong password and wrong code refused", async ({ page }) => {
  await page.goto(HMRC);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByLabel("Email address")).toHaveValue("");
  await page.getByLabel("Email address").fill("someone.else@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We could not find a GOV.UK One Login").first()).toBeVisible();
  const s = await sam();
  await page.getByLabel("Email address").fill(s.email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Password")).toHaveValue("");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the correct password").first()).toBeVisible();
  await page.getByLabel("Password").fill(s.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Enter the 6 digit security code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("The code you entered is not correct").first()).toBeVisible();
  // The demo details aren't served through the tunnel.
  expect((await fetch(`${OL}/api/demo/sam`, { headers: { "x-demo-key": process.env.DEMO_CONSOLE_KEY! } })).status).toBe(404);
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

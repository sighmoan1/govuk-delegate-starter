import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { signRequest, type Directory } from "../packages/web-bot-auth/src/index";

// Agents in browsers. A "signed" context signs every request with Web Bot Auth,
// as ChatGPT agent does (here with the dev test agent's key). An "unsigned"
// context is like an agent HMRC can't see, or a person.
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:3300";
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
const ABOUT = process.env.ABOUT_URL ?? "http://localhost:3304";

const jwks = JSON.parse(readFileSync("dev/test-agent.jwks.json", "utf8")) as Directory;
const KEY = { privateKeyPem: readFileSync("dev/test-agent-private.pem", "utf8"), keyid: jwks.keys[0].kid!, agent: "https://test-agent.local" };

async function signedContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await ctx.route("**/*", async (route) => {
    const r = route.request();
    const url = new URL(r.url());
    if (!/^localhost:33\d\d$/.test(url.host)) return route.continue();
    // Follow redirects ourselves, signing every hop, as an agent's signing
    // browser does (Playwright doesn't intercept browser-followed redirects).
    let target = url;
    let method = r.method();
    let response = await route.fetch({ headers: { ...r.headers(), ...signRequest({ method, authority: target.host, path: target.pathname + target.search }, KEY) }, maxRedirects: 0 });
    for (let hop = 0; hop < 5 && response.status() >= 300 && response.status() < 400 && response.headers()["location"]; hop++) {
      target = new URL(response.headers()["location"], target);
      if (response.status() === 303 || ((response.status() === 301 || response.status() === 302) && method === "POST")) method = "GET";
      const cookie = (await ctx.cookies(target.origin)).map((c) => `${c.name}=${c.value}`).join("; ");
      const setCookies = response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
      if (setCookies.length) await ctx.addCookies(setCookies.map((sc) => { const [nv] = sc.split(";"); const i = nv.indexOf("="); return { name: nv.slice(0, i), value: nv.slice(i + 1), url: target.origin }; }));
      const jar = (await ctx.cookies(target.origin)).map((c) => `${c.name}=${c.value}`).join("; ") || cookie;
      response = await route.fetch({
        url: target.toString(), method, postData: undefined, maxRedirects: 0,
        headers: { ...(jar ? { cookie: jar } : {}), "user-agent": r.headers()["user-agent"], ...signRequest({ method, authority: target.host, path: target.pathname + target.search }, KEY) },
      });
    }
    return route.fulfill({ response });
  });
  return ctx;
}

async function signIn(page: Page, email?: string) {
  if (!/localhost:3301/.test(page.url())) return;
  if (email) await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Sam, in her own browser, approves the code the agent gave her. */
async function samApproves(browser: Browser, code: string, opts: { untick?: RegExp } = {}) {
  const ctx = await browser.newContext();
  const sam = await ctx.newPage();
  await sam.goto(`${DELEGATE}/approve?code=${code}`);
  await signIn(sam);
  await expect(sam.getByRole("heading", { level: 1 })).toContainText("wants to act for you");
  if (opts.untick) await sam.getByLabel(opts.untick).uncheck();
  await sam.getByRole("button", { name: "Continue" }).click();
  await sam.getByRole("button", { name: "Allow" }).click();
  await expect(sam.getByRole("heading", { name: "Agent authorised" })).toBeVisible();
  return { ctx, sam };
}

async function reset(page: Page) {
  await page.goto(ABOUT);
  await page.getByRole("button", { name: "Reset everything" }).click();
  await expect(page.locator(".start-from__done")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("a verified agent is shown the proper route, Sam approves on her own device, and the agent's claim is attributed to it", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await reset(page);
  const agentCtx = await signedContext(browser);
  const agent = await agentCtx.newPage();

  // It goes straight for Sam's account: HMRC recognises it and points it to "Act for someone".
  await agent.goto(`${HMRC}/your-tax`);
  await expect(agent.getByRole("heading", { name: "Act for someone" })).toBeVisible();
  await expect(agent.getByText("You’re using Test agent.")).toBeVisible();
  await expect(agent.getByText("We can see you are")).toBeVisible();
  await agent.getByRole("button", { name: "Get a code" }).click();
  await expect(agent.getByRole("heading", { name: "Ask the person to approve you" })).toBeVisible();
  const code = (await agent.locator(".code-panel--big").innerText()).trim();

  const { ctx } = await samApproves(browser, code);
  await ctx.close();

  // The waiting page carries on by itself once Sam has decided.
  await expect(agent).toHaveURL(/\/your-tax/, { timeout: 20_000 });
  await expect(agent.locator(".acting-banner")).toContainText("Test agent is acting for this person");
  await agent.getByRole("link", { name: "Claim tax relief for working from home" }).click();
  await agent.getByLabel(/My employer required me to work from home/).check();
  await agent.getByRole("button", { name: "Continue" }).click();
  await agent.getByRole("button", { name: "Submit claim" }).click();
  await expect(agent.getByRole("heading", { name: "Claim received" })).toBeVisible();
  await expect(agent.locator("ul.claims")).toContainText("Submitted by Test agent on your behalf");
  await agentCtx.close();
});

test("an agent can't approve itself, even with Sam's sign-in", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await reset(page);
  const agentCtx = await signedContext(browser);
  const agent = await agentCtx.newPage();
  await agent.goto(`${HMRC}/act-for-someone`);
  await agent.getByRole("button", { name: "Get a code" }).click();
  const code = (await agent.locator(".code-panel--big").innerText()).trim();

  const tab = await agentCtx.newPage();
  await tab.goto(`${DELEGATE}/approve?code=${code}`);
  await expect(tab.locator(".ol-warning")).toContainText("This sign-in is for people");
  await signIn(tab);
  await tab.getByRole("button", { name: "Continue" }).click();
  await tab.getByRole("button", { name: "Allow" }).click();
  await expect(tab.getByRole("heading", { name: "The person needs to do this themselves" })).toBeVisible();
  await agentCtx.close();
});

test("an agent using Sam's password is still the agent: it's sent to the proper route", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await reset(page);
  const agentCtx = await signedContext(browser);
  const agent = await agentCtx.newPage();
  await agent.goto(HMRC);
  await agent.getByRole("button", { name: "Start now" }).click();
  await expect(agent.locator(".ol-warning")).toContainText("This sign-in is for people");
  await signIn(agent);
  await expect(agent.getByRole("heading", { name: "Act for someone" })).toBeVisible();
  await expect(agent.getByText("can’t act as someone, even with their sign-in details")).toBeVisible();

  // The API says the same, in machine-readable form, quickly.
  const started = Date.now();
  const res = await agent.request.get(`${HMRC}/api/tax-code`);
  expect(res.status()).toBe(403);
  expect(await res.json()).toMatchObject({ reason: "AGENT_NOT_AUTHORISED", lane: "DECLARED_AGENT", next: { act_for_someone: `${HMRC}/act-for-someone` } });
  expect(Date.now() - started).toBeLessThan(1000);
  await agentCtx.close();
});

test("a declared agent (unsigned, in a browser) can be given permission, but not for sensitive changes", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await reset(page);
  const ctx = await browser.newContext();
  const agent = await ctx.newPage();
  await agent.goto(`${HMRC}/act-for-someone`);
  await agent.getByLabel("Name of the assistant or app").fill("Claude");
  await agent.getByLabel("Who provides it").fill("Anthropic");
  await agent.getByLabel("Change the bank account for refunds").check();
  await agent.getByRole("button", { name: "Get a code" }).click();
  const code = (await agent.locator(".code-panel--big").innerText()).trim();
  const { ctx: samCtx } = await samApproves(browser, code);
  await samCtx.close();
  await expect(agent).toHaveURL(/\/your-tax/, { timeout: 20_000 });
  await expect(agent.locator(".acting-banner")).toContainText("Claude is acting for this person");

  // Even with Sam's permission, a self-declared identity can't change where refunds go.
  const res = await agent.request.post(`${HMRC}/api/refund-account`, { data: {} });
  expect(res.status()).toBe(403);
  expect((await res.json()).reason).toBe("ASSURANCE_TOO_LOW");
  await ctx.close();
});

test("removing access ends the agent's session, and a copied session doesn't work for another agent", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await reset(page);
  const agentCtx = await signedContext(browser);
  const agent = await agentCtx.newPage();
  await agent.goto(`${HMRC}/act-for-someone`);
  await agent.getByRole("button", { name: "Get a code" }).click();
  const code = (await agent.locator(".code-panel--big").innerText()).trim();
  const { ctx: samCtx, sam } = await samApproves(browser, code);
  await expect(agent).toHaveURL(/\/your-tax/, { timeout: 20_000 });

  // The session cookie, copied into a browser that doesn't sign as the agent, is refused.
  const cookies = await agentCtx.cookies(HMRC);
  const thief = await browser.newContext();
  await thief.addCookies(cookies);
  const stolen = await thief.newPage();
  await stolen.goto(`${HMRC}/your-tax`);
  await expect(stolen.getByText("That session belonged to a different assistant.")).toBeVisible();
  await thief.close();

  // Sam removes access; the agent's next page load ends its session.
  await sam.goto(`${DELEGATE}/account/delegates`);
  await sam.getByRole("link", { name: /Remove access/ }).first().click();
  await sam.getByRole("button", { name: "Remove access" }).click();
  await agent.goto(`${HMRC}/your-tax`);
  await expect(agent.getByText("The person has removed your permission.")).toBeVisible();
  await samCtx.close();
  await agentCtx.close();
});

test("discovery: agents can find the proper route", async ({ page, request }) => {
  await page.goto(HMRC);
  await expect(page.getByRole("link", { name: "Let an assistant act for you properly" })).toBeVisible();
  expect(await page.locator('link[rel="agent-access"]').getAttribute("href")).toBe("/.well-known/agent-access.json");
  const access = await (await request.get(`${HMRC}/.well-known/agent-access.json`)).json();
  expect(access.routes.browser_agents.start).toBe(`${HMRC}/act-for-someone`);
  expect(await (await request.get(`${HMRC}/llms.txt`)).text()).toContain("Do not sign in as the person");
  const api = await (await request.get(`${HMRC}/openapi.json`)).json();
  expect(Object.keys(api.paths)).toContain("/api/job-expenses");
});

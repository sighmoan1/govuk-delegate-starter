const ONELOGIN = process.env.ONELOGIN_URL ?? "http://localhost:3301";
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
    try { await signAndForward(route); } catch (e) { console.error("SIGNER FAILED", route.request().url(), e); await route.abort(); }
  });
  return ctx;
}

async function signAndForward(route: import("@playwright/test").Route) {
  const r = route.request();
  const url = new URL(r.url());
  if (![DELEGATE, HMRC, ABOUT, ONELOGIN].some(base => new URL(base).origin === url.origin)) return route.continue();
  const headers = { ...r.headers(), ...signRequest({ method: r.method(), authority: url.host, path: url.pathname + url.search }, KEY) };
  // In-page fetches (Next's router, server actions) follow redirects transparently, as fetch does.
  if (!r.isNavigationRequest()) return route.fulfill({ response: await route.fetch({ headers }) });
  // Playwright doesn't intercept redirects the browser follows, so they'd go
  // unsigned. Turn each redirect into a fresh navigation instead: the browser
  // makes a new request (which this signs) and its address bar stays truthful.
  // route.fetch shares the context's cookie jar, so Set-Cookie still lands.
  const response = await route.fetch({ headers, maxRedirects: 0 });
  const location = response.headers()["location"];
  if (response.status() >= 300 && response.status() < 400 && location) {
    const next = new URL(location, url).toString().replace(/"/g, "&quot;");
    return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><meta http-equiv="refresh" content="0;url=${next}">` });
  }
  return route.fulfill({ response });
}

async function signIn(page: Page, email?: string) {
  if (new URL(page.url()).origin !== new URL(ONELOGIN).origin) return;
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
  for (const checkbox of await sam.getByRole("checkbox").all()) await checkbox.check();
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

test.describe.configure({ mode: "serial", timeout: 120_000 });

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
  // Attribution is shown in the claim-status view, which needs its own permission.
  await agent.getByLabel("See how their claims are going").check();
  await agent.getByRole("button", { name: "Get a code" }).click();
  await expect(agent.getByRole("heading", { name: "Ask the person to approve you" })).toBeVisible();
  const code = (await agent.locator(".code-panel--big").innerText()).trim();

  const { ctx } = await samApproves(browser, code);
  await ctx.close();

  // The waiting page carries on by itself once Sam has decided.
  await expect(agent.locator(".acting-banner")).toBeVisible({ timeout: 20_000 });
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
  // Wait for consent before enumerating scopes; an empty selection is refused.
  await expect(tab.getByRole("heading", { level: 1 })).toContainText("wants to act for you");
  await expect(tab.getByRole("checkbox").first()).toBeVisible();
  for (const checkbox of await tab.getByRole("checkbox").all()) await checkbox.check();
  await tab.getByRole("button", { name: "Continue" }).click();
  await expect(tab.getByRole("heading", { name: "Check what you are allowing" })).toBeVisible();
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
  await agent.getByRole("button", { name: "Sign in with GOV.UK One Login" }).click();
  await expect(agent.locator(".ol-warning")).toContainText("This sign-in is for people");
  await signIn(agent);
  await expect(agent.getByRole("heading", { name: "Act for someone" })).toBeVisible();
  await expect(agent.getByText("can’t act as someone, even with their sign-in details")).toBeVisible();

  // The API says the same, in machine-readable form, quickly.
  const started = Date.now();
  // (APIRequestContext bypasses the route signer, so sign this one by hand.)
  const api = new URL(`${HMRC}/api/tax-code`);
  const res = await agent.request.get(api.toString(), { headers: signRequest({ method: "GET", authority: api.host, path: api.pathname }, KEY) });
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
  await expect(agent.locator(".acting-banner")).toBeVisible({ timeout: 20_000 });
  await expect(agent.locator(".acting-banner")).toContainText("Claude is acting for this person");

  // Even with Sam's permission, a self-declared identity can't change where refunds go.
  const res = await agent.request.post(`${HMRC}/api/refund-account`, { data: {} });
  expect(res.status()).toBe(403);
  expect((await res.json()).reason).toBe("ASSURANCE_TOO_LOW");
  await ctx.close();
});

test("a browser agent answers HMRC's question for Sam without being blocked; Sam then sees what it sent on GOV.UK", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await reset(page);
  const ctx = await browser.newContext();
  const agent = await ctx.newPage();
  await agent.goto(`${HMRC}/act-for-someone`);
  await agent.getByLabel("Name of the assistant or app").fill("Claude");
  await agent.getByLabel("Who provides it").fill("Anthropic");
  await agent.getByLabel("Claim tax relief for working from home").check();
  await agent.getByLabel(/Answer HMRC’s questions about a claim/).check();
  await agent.getByLabel("See how their claims are going").check();
  await agent.getByRole("button", { name: "Get a code" }).click();
  const code = (await agent.locator(".code-panel--big").innerText()).trim();
  const { ctx: samCtx, sam } = await samApproves(browser, code);
  await expect(agent.locator(".acting-banner")).toBeVisible({ timeout: 20_000 });

  expect((await agent.request.post(`${HMRC}/api/job-expenses`, { data: {} })).status()).toBe(200);
  await agent.goto(`${HMRC}/your-tax`);
  await expect(agent.getByRole("heading", { name: "HMRC has asked you a question" })).toBeVisible();

  await agent.getByLabel("Your answer").fill("My employer required it, from about 2022.");
  await agent.getByRole("button", { name: "Send answer" }).click();
  await expect(agent.getByRole("heading", { name: "Reply sent" })).toBeVisible();

  await sam.goto(`${DELEGATE}/account/delegates`);
  await expect(sam.getByText("Something was done in your name.")).toBeVisible();
  await sam.getByRole("link", { name: /Answer HMRC’s questions about your claim/ }).first().click();
  await expect(sam.locator("blockquote")).toContainText("My employer required it, from about 2022.");
  await expect(sam.getByText("did not say whether you had agreed")).toBeVisible();
  await samCtx.close();
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
  await expect(agent.locator(".acting-banner")).toBeVisible({ timeout: 20_000 });

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
  // The other browser must wait until the citizen revocation has committed.
  await expect(sam.getByRole("heading", { name: "Access removed", exact: true })).toBeVisible();
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

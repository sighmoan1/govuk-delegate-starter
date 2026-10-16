import { test, expect } from "@playwright/test";

// A deliberately adversarial, synthetic test. It DOES NOT target HMRC production.
// This is a boundary test, not a claim that transferring session cookies is an exploit.
// If an agent can control an unlabelled authenticated human session, the relying
// service cannot know whether a human or an agent clicked the button.
const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
const ONELOGIN = process.env.ONELOGIN_URL ?? "http://localhost:3301";

test("an undeclared browser agent using a shared human session can submit without Delegate", async ({ browser }) => {
  const principal = await browser.newContext();
  const person = await principal.newPage();

  // Only the synthetic One Login simulator is used. This context represents
  // the human granting browser-session access, NOT a Delegate authorisation.
  await person.goto(HMRC);
  await person.getByRole("button", { name: "Start now" }).click();
  await person.getByRole("button", { name: "Sign in with GOV.UK One Login" }).click();
  await expect(person).toHaveURL((url) => url.origin === new URL(ONELOGIN).origin && url.pathname === "/sign-in");
  await person.getByLabel("Email address").fill(`synthetic-share-${Date.now()}@example.com`);
  await person.getByRole("button", { name: "Continue" }).click();
  await expect(person.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await person.getByRole("button", { name: "Continue" }).click();
  await expect(person.getByRole("heading", { name: "Your tax" })).toBeVisible();

  // The attacker/agent has no signed agent identity and no Delegate mandate.
  // It is deliberately given only a copy of the human browser's cookies.
  const borrowedSession = await principal.cookies();
  const agentContext = await browser.newContext();
  await agentContext.addCookies(borrowedSession);
  const agent = await agentContext.newPage();
  await agent.goto(`${HMRC}/your-tax`);

  // The application treats this as the signed-in human, not an agent.
  await expect(agent.getByRole("heading", { name: "Your tax" })).toBeVisible();
  await agent.getByRole("link", { name: "Claim tax relief for working from home" }).click();
  await agent.getByLabel(/My employer required me to work from home/).check();
  await agent.getByRole("button", { name: "Continue" }).click();
  await expect(agent.getByRole("heading", { name: "Check your answers" })).toBeVisible();
  await agent.getByRole("button", { name: "Submit claim" }).click();

  // A durable receipt and human attribution show that there was an actual
  // persisted submission, not merely a permissive access-control response.
  await expect(agent.getByRole("heading", { name: "Claim received" })).toBeVisible();
  await expect(agent.locator("ul.claims")).toContainText("Submitted by you");
  await agent.goto(`${HMRC}/your-tax`);
  await expect(agent.locator("ul.claims")).toContainText("Submitted by you");

  await agentContext.close();
  await principal.close();
});

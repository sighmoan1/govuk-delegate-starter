import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma, newPrincipal, demoAgent, BASE } from "./helpers";
import { approveRequest, revokeAuthorisation, loadRequest, returnTo } from "@/lib/requests";

beforeAll(() => {
  process.env.AGENT_MODE = "scripted"; // deterministic; the LLM path has its own smoke test
});
afterAll(() => prisma.$disconnect());

const APP = process.env.APP_URL ?? "http://localhost:3300";

async function ask(token: string, body: Record<string, unknown>) {
  return fetch(`${BASE}/api/authorisation-requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ service: "hmrc-personal-tax", capabilities: ["view_tax_code"], ...body }),
  });
}

describe("redirect hand-off (consent screen → agent)", () => {
  it("rejects a return_url the delegate has not registered", async () => {
    const { token } = await demoAgent();
    for (const url of ["https://evil.example/callback", `${APP}/somewhere-else`, "javascript:alert(1)"]) {
      const res = await ask(token, { return_url: url });
      expect(res.status, url).toBe(400);
      expect((await res.json()).error).toBe("UNREGISTERED_RETURN_URL");
    }
  });

  it("accepts the registered return_url (with the agent's own query) and returns the person there with the outcome", async () => {
    const { token } = await demoAgent();
    const res = await ask(token, { return_url: `${APP}/example-ai/callback?conv=abc` });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.consent_url).toBe(`${APP}/consent/${created.id}`);

    const p = await newPrincipal();
    await approveRequest(created.id, p.id);
    const back = new URL(returnTo((await loadRequest(created.id))!, "approved")!);
    expect(back.pathname).toBe("/example-ai/callback");
    expect(back.searchParams.get("conv")).toBe("abc");
    expect(back.searchParams.get("request_id")).toBe(created.id);
    expect(back.searchParams.get("status")).toBe("approved");
  });

  it("tells the agent exactly what was granted after the person narrows the request", async () => {
    const { token } = await demoAgent();
    const created = await (await ask(token, { capabilities: ["view_tax_code", "claim_job_expenses", "update_employment"] })).json();
    const p = await newPrincipal();
    await approveRequest(created.id, p.id, ["view_tax_code", "claim_job_expenses"]);
    const seen = await (await fetch(`${BASE}/api/authorisation-requests/${created.id}`, { headers: { authorization: `Bearer ${token}` } })).json();
    expect(seen.principal_id).toBe(p.id);
    expect(seen.granted_capabilities.sort()).toEqual(["claim_job_expenses", "view_tax_code"]);
  });
});

describe("consent decision endpoint", () => {
  it("refuses a cross-origin form post, and sends an unsigned-in person to sign in", async () => {
    const { token } = await demoAgent();
    const created = await (await ask(token, {})).json();
    const post = (headers: Record<string, string>) =>
      fetch(`${BASE}/consent/${created.id}/decision`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
        body: "decision=approve&c=view_tax_code",
      });
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    const anon = await post({ origin: APP });
    expect(anon.status).toBe(303);
    expect(anon.headers.get("location")).toContain("/consent-signin");
    expect((await loadRequest(created.id))!.status).toBe("PENDING");
  });
});

describe("the Example AI assistant (scripted) runs the whole story through real HTTP", () => {
  it("asks → Sam approves → allow, allow → refuse unrequested → Sam removes → refuse revoked; one activity event per HMRC call", async () => {
    const { createConversation, loadConversation } = await import("@/lib/agent/conversation");
    const { handleUserMessage, handleConsentReturn } = await import("@/lib/agent/agent");
    const sam = await newPrincipal();
    const conv = await createConversation();
    const before = await prisma.activityEvent.count();
    const steps = async () => (await loadConversation(conv.id))!.state.display.filter((d) => d.kind === "step");

    // 1. Sam asks; the agent is not connected, so it asks GOV.UK for permission and waits.
    await handleUserMessage(conv.id, "Can you claim my working-from-home tax relief?");
    let c = (await loadConversation(conv.id))!;
    const consent = c.state.display.find((d) => d.kind === "consent");
    expect(consent).toBeTruthy();
    expect(c.pendingRequestId).toBeTruthy();
    expect(await steps()).toHaveLength(0);

    // 2. Sam approves on GOV.UK (browser flow covered by Playwright); the agent resumes by itself.
    await approveRequest(c.pendingRequestId!, sam.id, ["view_tax_code", "claim_job_expenses"]);
    await handleConsentReturn(conv.id, c.pendingRequestId!);
    c = (await loadConversation(conv.id))!;
    expect(c.principalId).toBe(sam.id);
    expect(c.state.granted.sort()).toEqual(["claim_job_expenses", "view_tax_code"]);
    let s = await steps();
    expect(s.map((x) => x.kind === "step" && `${x.capability}:${x.decision}`)).toEqual(["view_tax_code:ALLOW", "claim_job_expenses:ALLOW"]);
    expect(JSON.stringify(c.state.display)).toContain("1288L");

    // 3. Something Sam never allowed: HMRC refuses, and the agent says so.
    await handleUserMessage(conv.id, "Also change my refund bank account to my new bank");
    s = await steps();
    expect(s.at(-1)).toMatchObject({ capability: "change_refund_account", decision: "DENY", reason: "PERMISSION_MISSING" });

    // 3b. "Yes, ask me": the agent asks for what it holds PLUS the refused permission,
    // because approving replaces the current relationship.
    await handleUserMessage(conv.id, "Yes, ask me for that permission");
    c = (await loadConversation(conv.id))!;
    const extra = c.state.display.filter((d) => d.kind === "consent").at(-1);
    expect(extra?.kind === "consent" && extra.capabilities.sort()).toEqual(["change_refund_account", "claim_job_expenses", "view_tax_code"]);
    // Sam ignores it; the original authority stays as it was.
    await prisma.authorisationRequest.update({ where: { id: c.pendingRequestId! }, data: { status: "CANCELLED" } });

    // 4. Sam removes access; the same agent is refused on its next try.
    const auth = await prisma.authorisation.findFirstOrThrow({ where: { principalId: sam.id, status: "ACTIVE" } });
    await revokeAuthorisation(auth.id, sam.id);
    await handleUserMessage(conv.id, "What’s my tax code now?");
    s = await steps();
    expect(s.at(-1)).toMatchObject({ capability: "view_tax_code", decision: "DENY", reason: "AUTHORISATION_REVOKED" });

    // Every HMRC call the agent made was logged once.
    expect(await prisma.activityEvent.count()).toBe(before + s.length);
  });

  it("does not trust the callback URL: an unapproved request leaves the agent unconnected", async () => {
    const { createConversation, loadConversation } = await import("@/lib/agent/conversation");
    const { handleUserMessage, handleConsentReturn } = await import("@/lib/agent/agent");
    const conv = await createConversation();
    await handleUserMessage(conv.id, "Can you claim my working-from-home tax relief?");
    const pending = (await loadConversation(conv.id))!.pendingRequestId!;
    await handleConsentReturn(conv.id, pending); // still PENDING at Delegate
    const c = (await loadConversation(conv.id))!;
    expect(c.principalId).toBeNull();
    expect(c.pendingRequestId).toBe(pending);
  });
});

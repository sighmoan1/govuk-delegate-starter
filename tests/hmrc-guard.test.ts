import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit tests for the HMRC web-page guard. Delegate is simulated, so these need
// no running services: they prove what the guard does with each answer.

const m = vi.hoisted(() => ({
  askDelegate: vi.fn(),
  logEvent: vi.fn(async () => ({})),
  session: { value: null as any },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "test" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: url });
  },
}));
vi.mock("../apps/hmrc/src/lib/session", () => ({ currentTaxpayer: async () => ({ oneLoginSubject: "person-1", id: "t1" }) }));
vi.mock("../apps/hmrc/src/lib/friction", () => ({ CHALLENGE_COOKIE: "c", takeToken: () => ({ allowed: true }) }));
vi.mock("../apps/hmrc/src/lib/events", () => ({ logEvent: m.logEvent }));
vi.mock("../apps/hmrc/src/lib/agent-identity", () => ({ verifyAgentSignatureFromHeaders: async () => ({ verified: false, reason: "NO_SIGNATURE" }) }));
vi.mock("../apps/hmrc/src/lib/agent-session", () => ({ currentAgentSession: async () => m.session.value }));
vi.mock("../apps/hmrc/src/lib/delegate-client", () => ({ askDelegate: m.askDelegate }));
vi.mock("../apps/hmrc/src/lib/taxpayers", () => ({ findOrCreateTaxpayer: async (s: string) => ({ oneLoginSubject: s, id: "t1" }) }));

import { requireViewer, viewerCan } from "../apps/hmrc/src/lib/guard";

const agentSession = { agentName: "Personal assistant", subject: "person-1", principalId: "p1", delegationToken: "tok", delegationId: "d1", assurance: "VERIFIED", signatureAgent: null };
const allow = (n = "c1") => ({ authorised: true, status: "ACTIVE", check_id: n });
const deny = (reason: string) => ({ authorised: false, reason, check_id: "cx" });

async function redirectOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e: any) {
    if (e.redirectTo) return e.redirectTo as string;
    throw e;
  }
  return null;
}

beforeEach(() => {
  m.askDelegate.mockReset();
  m.logEvent.mockClear();
  m.session.value = agentSession;
});

describe("requireViewer, approved agent", () => {
  it("asks Delegate for the requested capability, not a fixed one", async () => {
    m.askDelegate.mockResolvedValue(allow());
    const v = await requireViewer("/claim", "claim_job_expenses");
    expect(m.askDelegate).toHaveBeenCalledWith(expect.objectContaining({ capability: "claim_job_expenses" }));
    expect(v.kind).toBe("agent");
    expect(m.logEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: "ALLOWED", capability: "claim_job_expenses", delegateCheckId: "c1" }));
  });

  it.each(["PERMISSION_MISSING", "ASSURANCE_TOO_LOW", "STEP_UP_REQUIRED", "SOMETHING_NEW"])("%s is refused and logged, never allowed", async (reason) => {
    m.askDelegate.mockResolvedValue(deny(reason));
    const to = await redirectOf(requireViewer("/your-tax", "view_tax_code"));
    expect(to).toBe(`/act-for-someone?denied=${reason}`);
    expect(m.logEvent).toHaveBeenCalledTimes(1);
    expect(m.logEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: "REFUSED", reason }));
  });

  it.each(["AUTHORISATION_REVOKED", "AUTHORISATION_EXPIRED", "NO_AUTHORISATION", "UNKNOWN_DELEGATE"])("%s ends the session", async (reason) => {
    m.askDelegate.mockResolvedValue(deny(reason));
    expect(await redirectOf(requireViewer("/your-tax", "view_tax_code"))).toBe(`/act-for-someone/stop?ended=${reason}`);
    expect(m.logEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: "REFUSED", reason }));
  });

  it("fails closed when Delegate is down", async () => {
    m.askDelegate.mockRejectedValue(new Error("GOV.UK Delegate answered 503"));
    expect(await redirectOf(requireViewer("/claim", "claim_job_expenses"))).toBe("/act-for-someone?denied=DELEGATE_UNAVAILABLE");
    expect(m.logEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: "REFUSED", reason: "DELEGATE_UNAVAILABLE" }));
    expect(m.logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: "ALLOWED" }));
  });

  it("fails closed on a malformed answer", async () => {
    m.askDelegate.mockResolvedValue(undefined);
    expect(await redirectOf(requireViewer("/claim", "claim_job_expenses"))).toMatch(/^\/act-for-someone\?denied=/);
  });

  it("mixed permissions: claim-only agent gets in but cannot see tax-code data", async () => {
    m.askDelegate.mockImplementation(async ({ capability }) => (capability === "claim_job_expenses" ? allow() : deny("PERMISSION_MISSING")));
    const v = await requireViewer("/your-tax", ["view_tax_code", "view_claim_status", "respond_to_query", "claim_job_expenses"]);
    expect(viewerCan(v, "claim_job_expenses")).toBe(true);
    expect(viewerCan(v, "view_tax_code")).toBe(false);
    expect(viewerCan(v, "view_claim_status")).toBe(false);
    expect(viewerCan(v, "respond_to_query")).toBe(false);
  });

  it("mixed permissions: tax-code agent sees tax code only", async () => {
    m.askDelegate.mockImplementation(async ({ capability }) => (capability === "view_tax_code" ? allow() : deny("PERMISSION_MISSING")));
    const v = await requireViewer("/your-tax", ["view_tax_code", "view_claim_status", "claim_job_expenses"]);
    expect(viewerCan(v, "view_tax_code")).toBe(true);
    expect(viewerCan(v, "claim_job_expenses")).toBe(false);
  });

  it("mixed permissions: a partial outage does not grant the unchecked capability", async () => {
    m.askDelegate.mockImplementation(async ({ capability }) => {
      if (capability === "view_tax_code") throw new Error("boom");
      return allow();
    });
    const v = await requireViewer("/your-tax", ["view_tax_code", "claim_job_expenses"]);
    expect(viewerCan(v, "view_tax_code")).toBe(false);
    expect(viewerCan(v, "claim_job_expenses")).toBe(true);
  });

  it("refuses when every capability on a multi-capability page is denied", async () => {
    m.askDelegate.mockResolvedValue(deny("PERMISSION_MISSING"));
    expect(await redirectOf(requireViewer("/your-tax", ["view_tax_code", "claim_job_expenses"]))).toBe("/act-for-someone?denied=PERMISSION_MISSING");
  });
});

describe("requireViewer, signed-in person", () => {
  it("is unaffected by Delegate and can see everything", async () => {
    m.session.value = null;
    const v = await requireViewer("/your-tax", "view_tax_code");
    expect(v.kind).toBe("person");
    expect(viewerCan(v, "view_tax_code")).toBe(true);
    expect(m.askDelegate).not.toHaveBeenCalled();
  });
});

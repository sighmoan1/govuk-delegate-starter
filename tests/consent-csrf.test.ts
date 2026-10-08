import { describe, it, expect, afterAll } from "vitest";
import { prisma, newPrincipal, demoAgent, createRequest } from "./helpers";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { decisionToken } from "@/lib/consent-csrf";
import { loadRequest } from "@/lib/requests";
import { POST } from "@/app/(govuk)/consent/[id]/decision/route";

const APP = process.env.APP_URL ?? "http://localhost:3300";

afterAll(() => prisma.$disconnect());

async function pending(caps = ["view_tax_code"]) {
  const p = await newPrincipal();
  const { token } = await demoAgent();
  const { body } = await createRequest(token, { capabilities: caps });
  await prisma.authorisationRequest.update({ where: { id: body.id }, data: { principalId: p.id } });
  const cookie = await signSession(p.id);
  return { p, id: body.id as string, cookie };
}

function post(id: string, cookie: string, fields: Record<string, string | string[]>, headers: Record<string, string> = { origin: APP }) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) for (const x of ([] as string[]).concat(v)) body.append(k, x);
  return POST(
    new Request(`${APP}/consent/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: `${SESSION_COOKIE}=${cookie}`, ...headers },
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
}

const status = async (id: string) => (await loadRequest(id))!.status;

describe("consent decision CSRF defence", () => {
  it("rejects a missing Origin, even with a valid token", async () => {
    const { id, cookie } = await pending();
    const r = await post(id, cookie, { decision: "approve", c: "view_tax_code", csrf: decisionToken(cookie, id) }, {});
    expect(r.status).toBe(403);
    expect(await status(id)).toBe("PENDING");
  });

  it("rejects a cross-origin POST, even with a valid token", async () => {
    const { id, cookie } = await pending();
    const r = await post(id, cookie, { decision: "approve", c: "view_tax_code", csrf: decisionToken(cookie, id) }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(await status(id)).toBe("PENDING");
  });

  it.each([["missing", undefined], ["bad", "not-the-token"]])("%s token cannot approve or reject, with a spoofed Origin", async (_n, csrf) => {
    const { id, cookie } = await pending();
    for (const decision of ["approve", "reject"]) {
      const r = await post(id, cookie, { decision, c: "view_tax_code", ...(csrf ? { csrf } : {}) });
      expect(r.status).toBe(403);
    }
    expect(await status(id)).toBe("PENDING");
  });

  it("a token for another request or another session is refused", async () => {
    const a = await pending();
    const b = await pending();
    expect((await post(a.id, a.cookie, { decision: "reject", csrf: decisionToken(a.cookie, b.id) })).status).toBe(403);
    expect((await post(a.id, a.cookie, { decision: "reject", csrf: decisionToken(b.cookie, a.id) })).status).toBe(403);
    expect(await status(a.id)).toBe("PENDING");
  });

  it("a valid token grants the selected scopes and redirects back", async () => {
    const { id, cookie, p } = await pending(["view_tax_code", "claim_job_expenses"]);
    const r = await post(id, cookie, { decision: "approve", c: "view_tax_code", csrf: decisionToken(cookie, id) });
    expect(r.status).toBe(303);
    expect(await status(id)).toBe("APPROVED");
    const auth = await prisma.authorisation.findFirst({ where: { principalId: p.id }, include: { permissions: { include: { capability: true } } } });
    expect(auth!.permissions.map((x) => x.capability.code)).toEqual(["view_tax_code"]);
  });

  it("a valid token can reject", async () => {
    const { id, cookie } = await pending();
    expect((await post(id, cookie, { decision: "reject", csrf: decisionToken(cookie, id) })).status).toBe(303);
    expect(await status(id)).toBe("REJECTED");
  });

  it("replaying a used approval does not create a second authorisation", async () => {
    const { id, cookie, p } = await pending();
    const fields = { decision: "approve", c: "view_tax_code", csrf: decisionToken(cookie, id) };
    await post(id, cookie, fields);
    const again = await post(id, cookie, fields);
    expect(again.headers.get("location")).toContain("error=NOT_PENDING");
    expect(await prisma.authorisation.count({ where: { principalId: p.id } })).toBe(1);
  });
});

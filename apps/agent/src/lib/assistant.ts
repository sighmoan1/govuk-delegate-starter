// Example AI's assistant: a scripted conversation with Sam. Whatever it tries
// with HMRC, HMRC asks GOV.UK Delegate whether Sam allowed it.
import { prisma } from "./db";
import { config } from "./config";
import { callHmrc, readRequest, requestAuthority, signInToDelegate } from "./gov";

export type Card =
  | { type: "connect"; url: string; requestId: string; capabilities: string[] }
  | { type: "result"; title: string; rows: [string, string][] }
  | { type: "approve"; url: string; code: string };

const CONN = "hmrc";
const FIRST_ASK = ["view_tax_code", "claim_job_expenses"];

const LABEL: Record<string, string> = {
  view_tax_code: "view your tax code",
  claim_job_expenses: "claim tax relief for working from home",
  update_employment: "update your employment details",
  change_refund_account: "change the bank account HMRC pays refunds into",
  change_address: "change your address",
};
const list = (caps: string[]) => {
  const xs = caps.map((c) => LABEL[c] ?? c);
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
};

type Intent = "claim" | "tax_code" | "bank" | "ask" | "connect" | "approved";

export function intentOf(text: string): Intent | null {
  const t = text.toLowerCase();
  if (/i[’']?ve approved|approved it|i approved|done that/.test(t)) return "approved";
  if (/bank|refund account/.test(t)) return "bank";
  if (/ask for (it|that|permission)|^yes|ask me/.test(t)) return "ask";
  if (/reconnect|connect/.test(t)) return "connect";
  if (/relief|working from home|work from home|wfh|expense|claim/.test(t)) return "claim";
  if (/tax code/.test(t)) return "tax_code";
  return null;
}

const say = (text: string, card?: Card) => prisma.message.create({ data: { role: "ASSISTANT", text, card: card ?? undefined } });

export async function connection() {
  return prisma.connection.upsert({ where: { id: CONN }, update: {}, create: { id: CONN, granted: [] } });
}

async function askForPermission(capabilities: string[], intent: Intent | null, lead: string) {
  const conn = await connection();
  // A new approval replaces the current one, so ask for what is already held too.
  const caps = [...new Set([...conn.granted, ...capabilities])];
  const signin = await signInToDelegate();
  if (!signin.token) return say("Sorry, I couldn’t reach GOV.UK just now. Try again in a moment.");
  const req = await requestAuthority(signin.token, caps, `${config.appUrl}/callback`);
  if (!req.requestId || !req.consentUrl) return say("Sorry, GOV.UK didn’t accept the request. Try again in a moment.");
  await prisma.connection.update({ where: { id: CONN }, data: { pendingRequestId: req.requestId, pendingIntent: intent } });
  return say(`${lead} I’ll ask to ${list(caps)}. You can change or remove this at any time.`, {
    type: "connect", url: req.consentUrl, requestId: req.requestId, capabilities: caps,
  });
}

/** Try one HMRC action as the agent. Returns false if HMRC refused (and has already explained why). */
async function hmrc(capability: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; result: Record<string, string> | null }> {
  const conn = await connection();
  if (!conn.principalId) {
    await askForPermission(FIRST_ASK, null, "I’m not connected to HMRC yet.");
    return { ok: false, result: null };
  }
  const signin = await signInToDelegate();
  if (!signin.token) {
    await say("Sorry, I couldn’t reach GOV.UK just now. Try again in a moment.");
    return { ok: false, result: null };
  }
  const r = await callHmrc(capability, { token: signin.token, principalId: conn.principalId }, body);
  if (r.allowed) return { ok: true, result: (r.result ?? {}) as Record<string, string> };

  switch (r.reason) {
    case "PERMISSION_MISSING":
      await prisma.connection.update({ where: { id: CONN }, data: { pendingIntent: `missing:${capability}` } });
      await say(`I can’t do that. You haven’t given me permission to ${LABEL[capability] ?? capability}. You can do it yourself on GOV.UK, or I can ask you for permission.`);
      break;
    case "AUTHORISATION_REVOKED":
    case "AUTHORISATION_EXPIRED":
    case "NO_AUTHORISATION":
      await prisma.connection.update({ where: { id: CONN }, data: { principalId: null, granted: [], connectedAt: null } });
      await say(r.reason === "AUTHORISATION_EXPIRED"
        ? "My access to HMRC has expired. Want me to ask you to reconnect?"
        : "I no longer have access to HMRC. You removed it on GOV.UK. Want me to ask you to reconnect?");
      break;
    case "STEP_UP_REQUIRED":
      if (r.stepUp) {
        await prisma.connection.update({ where: { id: CONN }, data: { pendingIntent: `stepup:${capability}` } });
        await say("This is a sensitive change, so HMRC needs you to approve it on GOV.UK each time. Approve it there, then tell me and I’ll finish it.", {
          type: "approve", url: r.stepUp.approve_url, code: r.stepUp.user_code,
        });
        break;
      }
      await say("HMRC needs your approval for this, but didn’t say how. Try again later.");
      break;
    case "CAPACITY_EXCEEDED":
    case "DUPLICATE_SUBMISSION":
    case "NEW_EVIDENCE_REQUIRED":
      // Limits on what can be done for you, however many assistants try.
      await say(`HMRC said no: ${r.message ?? "you’ve reached a limit for now."}`);
      break;
    default:
      await say("HMRC didn’t accept that request. Try again later.");
  }
  return { ok: false, result: null };
}

async function doTaxCode() {
  const r = await hmrc("view_tax_code");
  if (r.ok) await say(`Your tax code is ${r.result!.tax_code} for ${r.result!.tax_year}.`);
}

async function doClaim() {
  const code = await hmrc("view_tax_code");
  if (!code.ok) return;
  const claim = await hmrc("claim_job_expenses", { tax_year: code.result!.tax_year });
  if (!claim.ok) return;
  await say("Done. I’ve claimed tax relief for working from home for you.", {
    type: "result",
    title: "Claim submitted to HMRC",
    rows: [
      ["Relief", claim.result!.relief],
      ["Tax code", `${code.result!.tax_code} → ${claim.result!.new_tax_code}`],
      ["Reference", claim.result!.claim_reference],
    ],
  });
}

async function doBank() {
  const r = await hmrc("change_refund_account", { details: "New bank account" });
  if (!r.ok) return;
  await say("Done. HMRC will pay any tax refunds into your new bank account.", {
    type: "result",
    title: "Refund bank account changed",
    rows: [["Reference", r.result!.change_reference]],
  });
}

/** What to do once Sam has given a permission, so the request she made isn't lost. */
const RESUME: Record<string, () => Promise<unknown>> = { claim: doClaim, tax_code: doTaxCode, bank: doBank };
const INTENT_FOR: Record<string, Intent> = { view_tax_code: "tax_code", claim_job_expenses: "claim", change_refund_account: "bank" };

async function run(intent: Intent) {
  const conn = await connection();
  switch (intent) {
    case "claim":
      if (!conn.principalId) return askForPermission(FIRST_ASK, "claim", "I can do that with HMRC. First I need your permission, which you give on GOV.UK.");
      return doClaim();
    case "tax_code":
      if (!conn.principalId) return askForPermission(["view_tax_code"], "tax_code", "I need your permission to look that up with HMRC.");
      return doTaxCode();
    case "bank":
      if (!conn.principalId) return askForPermission(["change_refund_account"], "bank", "I need your permission to change that with HMRC.");
      return doBank();
    case "ask": {
      const missing = conn.pendingIntent?.startsWith("missing:") ? conn.pendingIntent.slice(8) : null;
      if (!missing) return say("What would you like me to ask for?");
      // Remember what Sam actually asked for, and do it once she has said yes.
      return askForPermission([missing], INTENT_FOR[missing] ?? null, "OK.");
    }
    case "connect":
      return askForPermission(FIRST_ASK, null, "OK.");
    case "approved": {
      const waiting = conn.pendingIntent?.startsWith("stepup:") ? conn.pendingIntent.slice(7) : null;
      const resume = waiting ? RESUME[INTENT_FOR[waiting] ?? ""] : undefined;
      if (!resume) return say("Thanks. There’s nothing waiting for your approval.");
      return resume();
    }
  }
}

export async function handleMessage(text: string) {
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  const asked = await prisma.message.create({ data: { role: "USER", text: clean } });
  const intent = intentOf(clean);
  if (!intent) {
    await say("I can help with your tax: checking your tax code, claiming tax relief for working from home, or changing the bank account for refunds. What would you like to do?");
    return;
  }
  try {
    await run(intent);
  } finally {
    // Every message from Sam gets a reply, even if something above failed.
    const replied = await prisma.message.count({ where: { role: "ASSISTANT", seq: { gt: asked.seq } } });
    if (replied === 0) await say("Sorry, something went wrong. Please try again.");
  }
}

/** Sam has come back from GOV.UK. Ask Delegate what happened; never trust the URL. */
export async function handleReturn(requestId: string) {
  const conn = await connection();
  if (conn.pendingRequestId !== requestId) return;
  const signin = await signInToDelegate();
  if (!signin.token) return;
  const seen = await readRequest(signin.token, requestId);
  if (!seen.status || seen.status === "PENDING") return;

  if (seen.status !== "APPROVED" || !seen.principalId) {
    await prisma.connection.update({ where: { id: CONN }, data: { pendingRequestId: null, pendingIntent: null } });
    await say("OK. You didn’t give me permission, so I won’t do anything with HMRC.");
    return;
  }
  const intent = conn.pendingIntent;
  await prisma.connection.update({
    where: { id: CONN },
    data: { principalId: seen.principalId, granted: seen.granted, pendingRequestId: null, pendingIntent: null, connectedAt: new Date() },
  });
  await say(`Thanks. I’m connected to HMRC. I can ${list(seen.granted)}.`);
  const resume = intent ? RESUME[intent] : undefined;
  if (resume) await resume();
}

export const conversation = () => prisma.message.findMany({ orderBy: { seq: "asc" } });

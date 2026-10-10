/** Synthetic localhost-only website/mailbox. Never imports or calls WhenIsBins. */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {readFileSync,writeFileSync,renameSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import type { EmailAction, EmailConfig, EmailReceipt, ReceiptStore } from "./index";
export class MemoryReceiptStore implements ReceiptStore {
  private receipts = new Map<string, EmailReceipt>();
  async get(id: string) { return this.receipts.get(id); }
  async put(receipt: EmailReceipt) { this.receipts.set(receipt.operationId, receipt); }
}
export async function startEmailFixture(stateFile?:string) {
  const sessions = new Map<string, string>();
  const subscriptions = new Map<string, { action: EmailAction; confirmed: boolean; active: boolean; stop: string }>();
  let submissions = 0; let cancellations = 0;
  if(stateFile){try{const saved=JSON.parse(readFileSync(stateFile,"utf8"));for(const [key,value] of saved.subscriptions)subscriptions.set(key,value);submissions=saved.submissions;cancellations=saved.cancellations;}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}}
  const persist=()=>{if(!stateFile)return;mkdirSync(dirname(stateFile),{recursive:true,mode:0o700});const temp=stateFile+"."+randomUUID();writeFileSync(temp,JSON.stringify({subscriptions:[...subscriptions],submissions,cancellations}),{mode:0o600,flag:"wx"});renameSync(temp,stateFile);};
  let mode: "normal" | "challenge" | "refuse" | "lost" | "submitted" = "normal";
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const reply = (status: number, html: string) => { res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); };
    if (req.method === "GET" && (url.pathname === "/signup" || url.pathname.startsWith("/stop/"))) {
      if (mode === "challenge") return reply(200, '<p data-state="challenge">Human verification required</p>');
      const id = randomUUID(); const csrf = randomUUID(); sessions.set(id, csrf);
      res.setHeader("Set-Cookie", `session=${id}; HttpOnly; SameSite=Strict; Path=/`);
      const subscription = [...subscriptions.values()].find(s => url.pathname === `/stop/${s.stop}`);
      if (url.pathname.startsWith("/stop/") && !subscription) return reply(404, '<p data-state="refused">Unknown stop link</p>');
      const action = subscription?.action;
      reply(200, `<form method="post" action="${url.pathname}"><input type="hidden" name="csrf" value="${csrf}"><input name="property" value="${escape(action?.property ?? "")}" ${action ? "readonly" : ""}><input name="email" type="email" value="${escape(action?.email ?? "")}" ${action ? "readonly" : ""}><select name="reminderChoice"><option value="evening_before">Evening before</option></select><button type="submit">${action ? "Stop reminders" : "Sign up"}</button></form>`); return;
    }
    if (req.method === "POST") {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const fields = new URLSearchParams(Buffer.concat(chunks).toString());
      const session = /(?:^|; )session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
      const expectedOrigin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
      if (!session || fields.get("csrf") !== sessions.get(session) || req.headers.origin !== expectedOrigin)
        return reply(403, '<p data-state="refused">CSRF/session/origin refused</p>');
      sessions.delete(session);
      if (mode === "refuse") return reply(403, '<p data-state="refused">Service refused</p>');
      if (url.pathname === "/signup") {
        const action: EmailAction = { operation:"signup", property:fields.get("property")!, email:fields.get("email")!, reminderChoice:fields.get("reminderChoice")! };
        if (action.property !== "synthetic-property-1" || action.email !== "sam.test@example.invalid" || action.reminderChoice !== "evening_before") return reply(400, '<p data-state="refused">Unexpected fixture payload</p>');
        const key = `${action.property}:${action.email}`;
        if (!subscriptions.has(key) || !subscriptions.get(key)!.active) { submissions++; subscriptions.set(key, {action,confirmed:false,active:true,stop:randomUUID()}); }
        persist();
        if (mode === "lost") return reply(200, ""); // Mutation happened; acknowledgement was lost.
        return reply(200, mode === "submitted" ? '<p data-state="submitted">Request received</p>' : '<p data-state="confirmation_required">Check your inbox to confirm</p>');
      }
      const subscription = [...subscriptions.values()].find(s => url.pathname === `/stop/${s.stop}`);
      if (subscription) {
        if (subscription.active) cancellations++;
        subscription.active = false;persist();
        return reply(200, '<p data-state="confirmed">Reminders stopped</p>');
      }
    }
    reply(404, '<p data-state="refused">Not found</p>');
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const config: EmailConfig = { origin, signupPath:"/signup", selectors:{ property:'[name="property"]',email:'[name="email"]',reminderChoice:'[name="reminderChoice"]',submit:'button[type="submit"]',confirmed:'[data-state="confirmed"]',confirmationRequired:'[data-state="confirmation_required"]',challenge:'[data-state="challenge"]',refusal:'[data-state="refused"]',submitted:'[data-state="submitted"]' } };
  const key = (a: EmailAction) => `${a.property}:${a.email}`;
  return { config, setMode(value: typeof mode) { mode=value; }, counts:()=>({submissions,cancellations}),
    /** Controlled synthetic mailbox evidence; no mail delivery claim or public endpoint. */
    mailbox: { confirm(a: EmailAction) { const s=subscriptions.get(key(a)); if (!s?.active) throw new Error("No active confirmation message"); s.confirmed=true;persist(); }, stopPath(a: EmailAction) { const s=subscriptions.get(key(a)); if (!s?.confirmed) throw new Error("Inbox not confirmed"); return `/stop/${s.stop}`; } },
    async reconcile(a: EmailAction): Promise<"confirmed"|"absent"|"unknown"> { const s=subscriptions.get(key(a)); if (!s) return "absent"; if (a.operation === "cancel") return s.active ? "absent" : "confirmed"; return s.confirmed && s.active ? "confirmed" : "unknown"; },
    close:()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())) };
}

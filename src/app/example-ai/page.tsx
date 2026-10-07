import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { CONV_COOKIE, loadConversation, type DisplayItem } from "@/lib/agent/conversation";
import { CAPABILITY_COPY, REASON_COPY } from "@/lib/capabilities";
import { newChat, sendMessage } from "./actions";
import { SubmitButton } from "./submit";

export const metadata: Metadata = { title: "Example AI assistant" };
export const dynamic = "force-dynamic";

const CLAIM = "Can you claim my working-from-home tax relief?";
const BANK = "Also change my refund bank account to my new bank";
const CODE = "What’s my tax code now?";
const ASK = "Yes, ask me for that permission";

/** Suggested next messages, from what has happened so far. Free text always works too. */
function suggestionsFor(items: DisplayItem[], connected: boolean): string[] {
  if (!connected) return [CLAIM];
  const lastStep = [...items].reverse().find((i) => i.kind === "step");
  if (lastStep?.kind === "step" && lastStep.reason === "PERMISSION_MISSING") return [ASK, CODE];
  if (lastStep?.kind === "step" && lastStep.reason === "AUTHORISATION_REVOKED") return [CODE, "Can you reconnect to HMRC?"];
  return [BANK, CODE];
}

function Item({ item, last, pendingRequestId }: { item: DisplayItem; last: boolean; pendingRequestId: string | null }) {
  const id = last ? "latest" : undefined;
  switch (item.kind) {
    case "user":
      return <li id={id} className="from-user"><div className="msg msg--user"><span className="msg-who">You</span>{item.text}</div></li>;
    case "agent":
      return <li id={id}><div className="msg msg--agent"><span className="msg-who">Assistant</span>{item.text}</div></li>;
    case "notice":
      return <li id={id} className="wide"><div className="msg msg--notice">{item.text}</div></li>;
    case "consent":
      if (item.requestId !== pendingRequestId) {
        return (
          <li id={id} className="wide">
            <div className="msg msg--notice">Asked GOV.UK for permission to: {item.capabilities.map((c) => (CAPABILITY_COPY[c]?.label ?? c).toLowerCase()).join(", ")}.</div>
          </li>
        );
      }
      return (
        <li id={id} className="wide">
          <div className="consent-card">
            <h2>Permission needed from GOV.UK</h2>
            <p>The assistant is asking to act for you with HMRC. It wants to:</p>
            <ul>{item.capabilities.map((c) => <li key={c}>{CAPABILITY_COPY[c]?.label ?? c}</li>)}</ul>
            <a className="button" href={item.url}>Give permission on GOV.UK</a>
            <p className="small">You’ll sign in with GOV.UK One Login and choose what to allow. You come back here afterwards.</p>
          </div>
        </li>
      );
    case "step": {
      const allowed = item.decision === "ALLOW";
      return (
        <li id={id} className="wide">
          <details className="tool-step">
            <summary>
              HMRC · {CAPABILITY_COPY[item.capability]?.short ?? item.capability}
              <span className={`step-tag step-tag--${allowed ? "allow" : "deny"}`}>{allowed ? "Allowed" : "Refused"}</span>
            </summary>
            <p className="small">{item.reason ? REASON_COPY[item.reason] ?? item.reason : ""} HTTP {item.status}{item.lane ? ` · ${item.lane}` : ""}{item.reason ? ` · ${item.reason}` : ""}</p>
            <pre>{typeof item.detail === "string" ? item.detail : JSON.stringify(item.detail, null, 2)}</pre>
          </details>
        </li>
      );
    }
  }
}

export default async function ExampleAi() {
  const jar = await cookies();
  const conv = await loadConversation(jar.get(CONV_COOKIE)?.value);
  const items = conv?.state.display ?? [];

  return (
    <>
      <h1>Your assistant</h1>
      <p className="xai-intro">Ask it to sort out your tax. It can only act for you with HMRC once you’ve given it permission on GOV.UK.</p>

      {items.length > 0 && (
        <ol className="chat" aria-live="polite" aria-label="Conversation">
          {items.map((item, i) => <Item key={i} item={item} last={i === items.length - 1} pendingRequestId={conv?.pendingRequestId ?? null} />)}
        </ol>
      )}

      <form action={sendMessage}>
        <ul className="suggestions" aria-label="Suggested messages">
          {suggestionsFor(items, Boolean(conv?.principalId)).map((s) => (
            <li key={s}><SubmitButton className="" name="text" value={s}>{s}</SubmitButton></li>
          ))}
        </ul>
      </form>
      <form action={sendMessage} className="composer">
        <label htmlFor="text">Message the assistant</label>
        <input id="text" name="text" autoComplete="off" required />
        <SubmitButton>Send</SubmitButton>
      </form>

      <div className="xai-tools">
        <Link href="/account/delegates">Manage who can act for you on GOV.UK</Link>
        {items.length > 0 && (
          <form action={newChat}><button className="link-button" type="submit">Start a new chat</button></form>
        )}
      </div>
    </>
  );
}

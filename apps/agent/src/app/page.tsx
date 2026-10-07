import { connection, conversation, type Card } from "@/lib/assistant";
import { newChat, send } from "./actions";
import { SubmitButton } from "./submit";

function CardView({ card, live }: { card: Card; live: boolean }) {
  if (card.type === "connect") {
    if (!live) return null;
    return (
      <div className="connect-card">
        <div className="connect-card__head">
          <span className="connect-card__logo" aria-hidden="true">GOV.UK</span>
          <div>
            <strong>Connect HMRC</strong>
            <span className="muted">You’ll approve this on GOV.UK</span>
          </div>
        </div>
        <a className="xai-button connect-card__go" href={card.url}>Continue to GOV.UK</a>
      </div>
    );
  }
  if (card.type === "approve") {
    if (!live) return null;
    return (
      <div className="connect-card">
        <div className="connect-card__head">
          <span className="connect-card__logo" aria-hidden="true">GOV.UK</span>
          <div>
            <strong>Approve on GOV.UK</strong>
            <span className="muted">Code {card.code}</span>
          </div>
        </div>
        <a className="xai-button connect-card__go" href={card.url} target="_blank" rel="noopener">Open GOV.UK<span className="visually-hidden"> (opens in a new tab)</span></a>
      </div>
    );
  }
  return (
    <div className="result-card">
      <strong>{card.title}</strong>
      <dl>
        {card.rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function suggestions(last: string | undefined, connected: boolean): string[] {
  if (last?.includes("approve it on GOV.UK")) return ["I’ve approved it", "What’s my tax code?"];
  if (last?.includes("reconnect")) return ["Reconnect to HMRC", "Claim my working-from-home tax relief"];
  if (!connected) return ["Claim my working-from-home tax relief", "What’s my tax code?"];
  if (last?.includes("I can ask you for permission")) return ["Yes, ask me for permission", "What’s my tax code?"];
  return ["Change my refund bank account to my new bank", "What’s my tax code?"];
}

export default async function Assistant() {
  const [messages, conn] = await Promise.all([conversation(), connection()]);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "ASSISTANT")?.text;
  const chips = suggestions(lastAssistant, Boolean(conn.principalId));

  return (
    <div className="chat-page">
      {messages.length === 0 ? (
        <div className="empty">
          <h1>Hi Sam. What can I help with?</h1>
        </div>
      ) : (
        <>
          <h1 className="visually-hidden">Conversation with Example AI</h1>
          <ol className="chat" aria-live="polite" aria-label="Conversation">
            {messages.map((m, i) => {
              const card = m.card as Card | null;
              const live =
                (card?.type === "connect" && card.requestId === conn.pendingRequestId) ||
                (card?.type === "approve" && i === messages.length - 1 && Boolean(conn.pendingIntent?.startsWith("stepup:")));
              return (
                <li key={m.id} id={i === messages.length - 1 ? "latest" : undefined} className={m.role === "USER" ? "from-user" : "from-ai"}>
                  <div className={`msg msg--${m.role === "USER" ? "user" : "agent"}`}>
                    <span className="visually-hidden">{m.role === "USER" ? "You:" : "Example AI:"} </span>
                    {m.text}
                  </div>
                  {card && <CardView card={card} live={live} />}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <div className="composer-wrap">
        <form action={send}>
          <ul className="suggestions" aria-label="Suggestions">
            {chips.map((c) => <li key={c}><SubmitButton className="" name="text" value={c}>{c}</SubmitButton></li>)}
          </ul>
        </form>
        <form action={send} className="composer">
          <label htmlFor="text" className="visually-hidden">Message Example AI</label>
          <input id="text" name="text" autoComplete="off" placeholder="Message Example AI" required />
          <SubmitButton>Send</SubmitButton>
        </form>
        {messages.length > 0 && (
          <form action={newChat} className="new-chat"><button className="link-button" type="submit">New chat</button></form>
        )}
      </div>
    </div>
  );
}

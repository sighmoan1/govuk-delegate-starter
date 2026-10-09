import Link from "next/link";
import type { Transaction } from "@/generated/prisma";
import { fmt } from "@/lib/format";
import { RECEIPT_NOTE, STATUS_TEXT } from "@/lib/transactions";

type Props = Pick<Transaction, "id" | "status" | "receivedAt" | "completedAt" | "claimReference" | "submittedBy" | "agentName">;

/**
 * Where a claim HMRC has received has got to. It speaks only of taking the claim
 * in: nothing here says, or implies, that the claim is approved or eligible.
 */
export function TransactionPanel({ t }: { t: Props }) {
  const text = STATUS_TEXT[t.status];
  const waiting = t.status === "QUEUED" || t.status === "PROCESSING";
  return (
    <div className="two-thirds">
      <Link className="back-link" href="/your-tax">Back</Link>
      <span className="caption">Working-from-home claim</span>
      <h1>{text.heading}</h1>
      <div className="inset-text" role="status">
        <p>{text.meaning}</p>
        {waiting && <p>You do not need to send it again. This page does not update by itself: <a href={`/transactions/${t.id}`}>check again</a> in a minute.</p>}
        {t.status === "FAILED" && <p>You can <Link href="/claim">make the claim again</Link>.</p>}
      </div>
      <dl className="summary-list">
        <div><dt>Receipt reference</dt><dd>{t.id}</dd></div>
        <div><dt>Status</dt><dd>{t.status}</dd></div>
        <div><dt>Received</dt><dd>{fmt(t.receivedAt)}</dd></div>
        {t.status === "COMPLETED" && <div><dt>Claim reference</dt><dd>{t.claimReference}</dd></div>}
        {t.status === "COMPLETED" && t.completedAt && <div><dt>Recorded</dt><dd>{fmt(t.completedAt)}</dd></div>}
        <div><dt>Sent by</dt><dd>{t.submittedBy === "AGENT" ? `${t.agentName ?? "An agent"}, on your behalf` : "You"}</dd></div>
      </dl>
      <p>{RECEIPT_NOTE}</p>
      {t.submittedBy === "AGENT" && <p>Removing an agent’s permission stops it sending anything new. A claim it sent while it had your permission has already been received, and is still recorded.</p>}
    </div>
  );
}

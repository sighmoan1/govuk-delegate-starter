import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionPanel } from "@/app/(public)/transactions/[id]/panel";
import { RECEIPT_NOTE, STATUS_TEXT, transactionJson } from "@/lib/transactions";

// The status page a person sees for a claim HMRC has received (issue #21). Pure rendering: who may see
// which receipt is tested at the API in queue.test.ts, which uses the same rule.
type Base = { id: string; receivedAt: Date; completedAt: Date | null; claimReference: string; submittedBy: "SELF" | "AGENT"; agentName: string | null };
const base: Base = { id: "tx_abcdefghijklmnopqrstuv", receivedAt: new Date("2026-10-09T09:00:00Z"), completedAt: null, claimReference: "JE-12345678", submittedBy: "SELF", agentName: null };
const html = (t: Partial<Base> & { status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" }) => renderToStaticMarkup(<TransactionPanel t={{ ...base, ...t }} />);

describe("the claim status page", () => {
  it("says each state plainly, in an h1 and a status region, without ever saying approved or eligible", () => {
    for (const status of ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] as const) {
      const out = html({ status });
      expect(out).toContain(`<h1>${STATUS_TEXT[status].heading}</h1>`);
      expect(out).toContain('role="status"');
      expect(out).toContain(STATUS_TEXT[status].meaning);
      expect(out).toContain(RECEIPT_NOTE);
      expect(out).not.toMatch(/approv|eligib|accepted your claim|successful/i);
    }
  });

  it("waiting states tell the person not to send it again, and offer a check-again link rather than refreshing by itself", () => {
    for (const status of ["QUEUED", "PROCESSING"] as const) {
      const out = html({ status });
      expect(out).toContain("do not need to send it again");
      expect(out).toContain('href="/transactions/tx_abcdefghijklmnopqrstuv"');
      expect(out).not.toContain("http-equiv");
      expect(out).not.toContain("Claim reference");
    }
  });

  it("shows the claim reference only once the claim exists", () => {
    expect(html({ status: "QUEUED" })).not.toContain("JE-12345678");
    expect(html({ status: "FAILED" })).not.toContain("JE-12345678");
    expect(html({ status: "COMPLETED", completedAt: new Date("2026-10-09T09:01:00Z") })).toContain("JE-12345678");
  });

  it("a failed claim offers a way to try again and says nothing was claimed or decided", () => {
    const out = html({ status: "FAILED" });
    expect(out).toContain('href="/claim"');
    expect(out).toContain("Nothing was claimed and nothing has been decided");
  });

  it("says who sent it, and that removing an agent's permission does not undo a claim already received", () => {
    expect(html({ status: "QUEUED", submittedBy: "AGENT", agentName: "Demo Personal Agent" })).toContain("Demo Personal Agent, on your behalf");
    expect(html({ status: "QUEUED", submittedBy: "AGENT", agentName: "Demo Personal Agent" })).toContain("already been received, and is still recorded");
    expect(html({ status: "QUEUED" })).not.toContain("on your behalf");
  });

  it("uses the supplied design system's classes and no inline styles or scripts", () => {
    const out = html({ status: "QUEUED" });
    for (const c of ["two-thirds", "back-link", "inset-text", "summary-list"]) expect(out).toContain(c);
    expect(out).not.toMatch(/style=|<script/);
  });

  it("the API and the page use the same words, and the API never exposes the operator's error", () => {
    const j = transactionJson({ ...base, status: "FAILED", failedAt: new Date(), attempts: 5, maxAttempts: 5, operation: "claim_job_expenses" });
    expect(j.status_meaning).toBe(STATUS_TEXT.FAILED.meaning);
    expect(JSON.stringify(j)).not.toMatch(/last_error|lastError|approv|eligib/i);
  });
});

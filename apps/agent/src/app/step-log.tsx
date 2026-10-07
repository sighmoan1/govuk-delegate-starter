import type { Step } from "@/generated/prisma";

const TAG = { OK: "Done", REFUSED: "Refused", WAITING: "Waiting for Sam", INFO: "" } as const;

export function StepLog({ steps, label, waiting = false }: { steps: Step[]; label: string; waiting?: boolean }) {
  return (
    <ol className="steps" aria-label={label}>
      {steps.map((s) => {
        const ex = s.exchange as { consent_url?: string } | null;
        const cls = s.outcome.toLowerCase();
        return (
          <li key={s.id} className={cls}>
            <h3>
              {s.title}
              {TAG[s.outcome] && <span className={`tag-out ${cls}`}>{TAG[s.outcome]}</span>}
            </h3>
            <p>{s.text}</p>
            {waiting && s.outcome === "WAITING" && ex?.consent_url && (
              <a className="consent-cta" href={ex.consent_url}>Give permission on GOV.UK</a>
            )}
            {s.exchange && (
              <details>
                <summary>HTTP detail</summary>
                <pre>{JSON.stringify(s.exchange, null, 2)}</pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

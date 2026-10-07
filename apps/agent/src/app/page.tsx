import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { TASK } from "@/lib/runner";
import { HMRC_ACTIONS } from "@/lib/gov";
import { StepLog } from "./step-log";
import { forgetAndRun, runTask, tryAction } from "./actions";

export default async function TaskPage() {
  const run = await prisma.run.findFirst({
    where: { persona: "AGENT" },
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { n: "asc" } } },
  });
  const connected = run?.status === "DONE" && run.principalId;

  return (
    <>
      <h1>Sam’s assistant</h1>
      <p className="xai-intro">
        Example AI does tasks for Sam. To deal with HMRC it needs Sam’s permission, given on GOV.UK. It then acts as itself, never as Sam, and HMRC
        checks that permission every time.
      </p>

      <section className="task-card" aria-labelledby="task-h">
        <h2 id="task-h">{TASK.title}</h2>
        <p>Read Sam’s tax code, then claim the relief for this tax year with HMRC.</p>
        <div className="button-row">
          <form action={runTask}><button className="xai-button" type="submit">{run ? "Run again" : "Run task"}</button></form>
          {run?.principalId && (
            <form action={forgetAndRun}><button className="xai-button xai-button--quiet" type="submit">Forget Sam and ask again</button></form>
          )}
        </div>
      </section>

      {run && (
        <section id="log" aria-labelledby="log-h">
          <h2 id="log-h">What the assistant did</h2>
          <StepLog steps={run.steps} label="Steps" waiting={run.status === "WAITING_FOR_PERSON"} />
          {connected && (
            <div className="task-card">
              <h2>Try more</h2>
              <p>Whatever the assistant tries, HMRC asks GOV.UK Delegate whether Sam allowed it.</p>
              <div className="button-row">
                <form action={tryAction}>
                  <input type="hidden" name="run" value={run.id} />
                  <input type="hidden" name="capability" value="change_refund_account" />
                  <button className="xai-button xai-button--quiet" type="submit">Try something Sam didn’t allow: {HMRC_ACTIONS.change_refund_account.label.toLowerCase()}</button>
                </form>
                <form action={tryAction}>
                  <input type="hidden" name="run" value={run.id} />
                  <input type="hidden" name="capability" value="view_tax_code" />
                  <button className="xai-button xai-button--quiet" type="submit">Check Sam’s tax code again</button>
                </form>
              </div>
              <p className="muted" style={{ marginTop: ".75rem" }}>
                Sam can remove this access at any time in <a href={`${config.delegateUrl}/account/delegates`}>Who can act for you</a> on GOV.UK.
                Next: <a href="/flood">flood test</a>.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

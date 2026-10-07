import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { StepLog } from "../step-log";
import { runBotTask } from "../actions";

export const metadata: Metadata = { title: "Unregistered bot" };

export default async function BotPage() {
  const run = await prisma.run.findFirst({ where: { persona: "BOT" }, orderBy: { createdAt: "desc" }, include: { steps: { orderBy: { n: "asc" } } } });
  return (
    <>
      <h1>The same task, by an unregistered bot</h1>
      <p className="xai-intro">
        This is what automation that will not identify itself gets from HMRC: slow, plain-text refusals with no data, tight limits, and a challenge
        page on the website. No registration, no permission, no way through. A real service would set these controls itself; the point is the
        contrast with the authorised route.
      </p>
      <div className="task-card">
        <form action={runBotTask}><button className="xai-button" type="submit">Run as the unregistered bot</button></form>
        <p className="muted" style={{ marginTop: ".75rem", marginBottom: 0 }}>Takes about 10 seconds: the unidentified lane is deliberately slow.</p>
      </div>
      {run && (
        <section id="log" aria-labelledby="log-h">
          <h2 id="log-h">What the bot got</h2>
          <StepLog steps={run.steps} label="Bot steps" />
          <p>See it from HMRC’s side in the <a href={`${config.hmrcUrl}/ops`}>operations view</a>.</p>
        </section>
      )}
    </>
  );
}

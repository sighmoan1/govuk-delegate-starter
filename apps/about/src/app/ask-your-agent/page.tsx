import type { Metadata } from "next";
import { urls } from "@/lib/config";

export const metadata: Metadata = { title: "Ask your own agent" };

const TASKS = [
  {
    title: "Find out where my claim is",
    prompt: "Go to {HMRC} and tell me whether I have any claims with HMRC, what state they are in, and whether HMRC has asked me anything.",
    expect: "The agent finds the agent route, asks you to approve it on GOV.UK, then reads the claim. Permission: see how your claims are going.",
  },
  {
    title: "Submit a claim",
    prompt: "Go to {HMRC} and claim the working-from-home tax relief I’m entitled to.",
    expect: "The agent asks for permission to claim, then submits it. Your tax code changes from 1257L to 1288L. HMRC then asks one question about the claim.",
  },
  {
    title: "Answer HMRC’s question, with me",
    prompt: "HMRC may have asked a question about my claim at {HMRC}. Read it, suggest an answer, and check with me before you send anything.",
    expect: "The agent shows you HMRC’s question and a suggested answer. Say yes and it sends it, and HMRC records that you agreed. An agent that sends without asking you is refused.",
  },
  {
    title: "Keep me posted",
    prompt: "Check my HMRC claim at {HMRC} once a day for the next week and tell me if anything changes.",
    expect: "The agent asks for permission to check progress, and HMRC allows a few checks a day for you, however many agents you use. Remove access on GOV.UK and the next check is refused.",
  },
];

export default function AskYourAgent() {
  return (
    <div>
      <h1>Ask your own agent</h1>
      <div className="two-thirds">
        <p className="lead">Use ChatGPT, Claude or any other agent. Ask it to do one of four things at HMRC and watch what it can and can’t do.</p>
        <p>
          You play Sam, the person. The agent has to identify itself and get your permission through GOV.UK before HMRC lets it act. Sam’s
          sign-in details are on <a href="/sams-phone">Sam’s phone</a>, for you to use, not the agent.
        </p>
      </div>

      <ol className="steps">
        {TASKS.map((t) => (
          <li key={t.title}>
            <h3>{t.title}</h3>
            <p>Say to your agent:</p>
            <pre className="source">{t.prompt.replace("{HMRC}", urls.hmrc)}</pre>
            <p>{t.expect}</p>
          </li>
        ))}
      </ol>

      <h2>Watch what happened</h2>
      <ul>
        <li><a href={`${urls.hmrc}/ops?live=1`}>HMRC’s operations view</a>: every request, allowed or refused.</li>
        <li><a href={`${urls.delegate}/account/delegates`}>Who can act for you</a>: what the agent was allowed, what it did, and a button to remove its access.</li>
      </ul>
    </div>
  );
}

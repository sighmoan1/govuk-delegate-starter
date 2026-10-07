import type { Metadata } from "next";
import { urls } from "@/lib/config";
import { StartFrom } from "../start-from";

export const metadata: Metadata = { title: "Sam manages who can act for her" };

export default async function Manage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <div>
      <span className="caption">Scenario 2</span>
      <h1>Sam manages who can act for her</h1>
      <div className="two-thirds">
        <p className="lead">Sam wants to see which apps and people can deal with government for her, check what they’ve done, and take access away.</p>
        <p>
          <strong>What it shows:</strong> permission lives in Sam’s GOV.UK account, not inside each app. When she removes it, the very next
          request is refused, because services ask GOV.UK Delegate every time.
        </p>
      </div>

      <StartFrom back="/manage-who-can-act" recommended="with-access" done={reset} />

      <h2>Steps</h2>
      <ol className="steps">
        <li>
          <h3>Open Sam’s GOV.UK account</h3>
          <span className="where">GOV.UK · <a href={`${urls.delegate}/account/delegates`}>Who can act for you</a></span>
          <p>Sign in: press <strong>Continue</strong> twice. Example AI is listed, with what it can do and until when.</p>
        </li>
        <li>
          <h3>Check what it has done</h3>
          <span className="where">GOV.UK</span>
          <p>Choose <strong>View</strong>. The page shows the permission, when it was given, and everything the assistant has tried, including anything refused.</p>
        </li>
        <li>
          <h3>Remove its access</h3>
          <span className="where">GOV.UK</span>
          <p>Choose <strong>Remove access</strong>, then confirm.</p>
        </li>
        <li>
          <h3>The assistant can no longer act</h3>
          <span className="where">Example AI · <a href={urls.agent}>open</a></span>
          <p>Choose <strong>What’s my tax code?</strong>. HMRC refuses, and the assistant tells Sam it no longer has access. It offers to reconnect, which would send her back to GOV.UK to decide again.</p>
        </li>
        <li>
          <h3>From the assistant’s side</h3>
          <span className="where">Example AI · <a href={`${urls.agent}/settings`}>Connected services</a></span>
          <p>The assistant’s own settings show what it believes it holds, and point Sam to GOV.UK to change it.</p>
        </li>
      </ol>
    </div>
  );
}

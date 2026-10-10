import type { Metadata } from "next";
import { urls } from "@/lib/config";
import { StartFrom } from "../start-from";

export const metadata: Metadata = { title: "Sam manages who can act for her" };

export default async function Manage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <div>
      <span className="caption">Scenario 1</span>
      <h1>Sam manages who can act for her</h1>
      <div className="two-thirds">
        <p className="lead">Sam wants to see which apps and people can deal with government for her, check what they’ve done, and take access away.</p>
        <p>
          <strong>What it shows:</strong> permission lives in Sam’s GOV.UK account, not inside each app. When she removes it, the very next
          request is refused, because services ask Delegate every time.
        </p>
      </div>

      <StartFrom back="/manage-who-can-act" recommended="with-access" done={reset} />

      <h2>Steps</h2>
      <ol className="steps">
        <li>
          <h3>Open Sam’s GOV.UK account</h3>
          <span className="where">GOV.UK · <a href={`${urls.delegate}/account/delegates`}>Who can act for you</a></span>
          <p>For local sign-in, use the prefilled email and nonempty password, then press <strong>Continue</strong> twice. Public or strict mode validates Sam’s password and also asks for a mock phone code. The demo agent is listed, with what it can do and until when.</p>
        </li>
        <li>
          <h3>Check what it has done</h3>
          <span className="where">GOV.UK</span>
          <p>Choose <strong>View</strong>. The page shows the permission, when it was given, and recent activity, including refusals: up to 10 permission checks and 20 service outcomes, with no pagination.</p>
        </li>
        <li>
          <h3>Remove its access</h3>
          <span className="where">GOV.UK</span>
          <p>Choose <strong>Remove access</strong>, then confirm.</p>
        </li>
      </ol>
    </div>
  );
}

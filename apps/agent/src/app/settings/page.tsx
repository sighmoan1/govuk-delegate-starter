import type { Metadata } from "next";
import { connection } from "@/lib/assistant";
import { config } from "@/lib/config";
import { fmt } from "@/lib/format";
import { disconnect } from "../actions";

export const metadata: Metadata = { title: "Connected services" };

const LABEL: Record<string, string> = {
  view_tax_code: "View your tax code",
  claim_job_expenses: "Claim tax relief for working from home",
  update_employment: "Update your employment details",
  change_refund_account: "Change your refund bank account",
  change_address: "Change your address",
};

export default async function Settings() {
  const conn = await connection();
  const connected = Boolean(conn.principalId);
  return (
    <div className="settings">
      <h1>Connected services</h1>
      <div className="service-row">
        <span className="service-row__logo" aria-hidden="true">HMRC</span>
        <div className="service-row__body">
          <h2>HMRC</h2>
          {connected ? (
            <>
              <p className="ok">Connected through GOV.UK{conn.connectedAt ? ` since ${fmt(conn.connectedAt)}` : ""}</p>
              <p>Example AI can:</p>
              <ul>{conn.granted.map((g) => <li key={g}>{LABEL[g] ?? g}</li>)}</ul>
              <p className="muted">To change or remove this, go to <a href={`${config.delegateUrl}/account/delegates`}>Who can act for you on GOV.UK</a>.</p>
              <form action={disconnect}><button className="xai-button xai-button--quiet" type="submit">Forget this connection</button></form>
            </>
          ) : (
            <p className="muted">Not connected. Ask Example AI to do something with HMRC and it will ask you to connect.</p>
          )}
        </div>
      </div>
    </div>
  );
}

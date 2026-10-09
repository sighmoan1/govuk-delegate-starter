"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { CoverageState } from "@/lib/fingerprint-coverage";

// The SDK/provider is mounted only after a successful explicit enrolment. It
// never runs on ordinary HMRC pages, disabled studies, or missing configuration.
const Sensor = dynamic(() => import("./sensor"), { ssr: false });
export default function Study({ publicKey, initialState, enabled }: { publicKey: string; initialState: CoverageState; enabled: boolean }) {
  const [state, setState] = useState<CoverageState>(initialState);
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const [binding, setBinding] = useState<{ session_id: string; nonce: string }>();
  const [busy, setBusy] = useState(false);
  async function enrol() {
    setBusy(true);
    try {
      const r = await fetch("/api/research/fingerprint/enrol", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent, enrollment_token: token }) });
      const data = await r.json();
      if (!r.ok) { setState(data.state ?? "error"); return; }
      setBinding({ session_id: data.session_id, nonce: data.nonce });
    } catch { setState("error"); } finally { setBusy(false); }
  }
  return <section aria-label="Device research controls">
    <p role="status">Browser sensor: <strong>{state}</strong>. Missing coverage is not evidence of no bot.</p>
    {!enabled && <p>The study is switched off. No Fingerprint request has been made.</p>}
    {state === "missing" && <p>The public vendor key is missing. No Fingerprint request has been made.</p>}
    {enabled && publicKey && !binding && <>
      <label htmlFor="enrolment">Researcher-issued enrolment token</label>
      <input id="enrolment" className="input" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" />
      <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I consent to this synthetic device study and the disclosed vendor calls.</label>
      <button className="button" disabled={!consent || !token || busy} onClick={enrol}>Join device study</button>
    </>}
    {binding && <Sensor publicKey={publicKey} binding={binding} onState={setState} />}
  </section>;
}

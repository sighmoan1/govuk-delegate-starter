"use client";
import { useState } from "react";
export default function WhenIsBinsPage() {
  const [key, setKey] = useState(""); const [evidence, setEvidence] = useState<unknown>(); const [error, setError] = useState("");
  return <><h1>WhenIsBins connector observations</h1><p>This private research view describes our connector. It cannot see other WhenIsBins visitors or prove an agent used AI.</p>
    <form onSubmit={async e => { e.preventDefault(); setError(""); setEvidence(undefined); try { const response = await fetch("/api/monitoring/whenisbins", { headers: { "x-collection-key": key }, cache: "no-store" }); if (!response.ok) throw new Error(); setEvidence(await response.json()); } catch { setError("Evidence is unavailable. Check research access and configuration."); } }}>
      <label htmlFor="collection-key">Research collection key</label><input id="collection-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required /><button type="submit">Read connector evidence</button>
    </form><p role="status">{error}</p>{evidence !== undefined && <section aria-label="Connector evidence"><h2>Recorded evidence</h2><p>Counts cover at most the latest 500 source events. Repeated requests, occurrences and effects have separate identifiers. Source reports remain distinct from independently verified execution truth.</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(evidence, null, 2)}</pre></section>}</>;
}

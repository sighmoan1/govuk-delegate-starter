"use client";
import { useState } from "react";
import { FingerprintProvider, useVisitorData } from "@fingerprint/react";
import { errorCoverage, type CoverageState, type SensorSample } from "@/lib/fingerprint-coverage";

type Props = { publicKey: string; binding: { session_id: string; nonce: string }; onState: (state: CoverageState) => void };
function Sample({ binding, onState }: Omit<Props, "publicKey">) {
  const { getData, isLoading } = useVisitorData({ immediate: false, linkedId: binding.session_id });
  const [last, setLast] = useState<SensorSample>();
  const [saved, setSaved] = useState("");
  async function measure() {
    let sample: SensorSample;
    try {
      const data = await getData();
      sample = data.event_id ? { state: "identified", event_id: data.event_id, ...(data.visitor_id ? { visitor_id: data.visitor_id } : {}) } : { state: "missing" };
    } catch (error) { sample = errorCoverage(error); }
    setLast(sample); onState(sample.state);
    try {
      const response = await fetch("/api/research/fingerprint/sample", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sample, nonce: binding.nonce }) });
      const data = await response.json();
      setSaved(response.ok ? `Stored observation: ${data.verification}.` : "Research collection unavailable; HMRC access is unaffected.");
    } catch { setSaved("Research collection unavailable; HMRC access is unaffected."); }
  }
  return <>
    <button className="button" disabled={isLoading} onClick={measure}>Collect one browser sample</button>
    {last?.event_id && <p>Vendor event ID (client claim): <code>{last.event_id}</code></p>}
    {last?.visitor_id && <p>Vendor visitor ID (client claim): <code>{last.visitor_id}</code></p>}
    <p role="status">{saved}</p>
  </>;
}
export default function Sensor({ publicKey, ...props }: Props) {
  return <FingerprintProvider apiKey={publicKey} region="eu"><Sample {...props} /></FingerprintProvider>;
}

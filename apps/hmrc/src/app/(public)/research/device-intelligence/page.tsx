import Study from "./study";
import { initialCoverage } from "@/lib/fingerprint-coverage";

export default function DeviceIntelligence() {
  const enabled = process.env.FINGERPRINT_RESEARCH_ENABLED === "true" && process.env.PUBLIC_MODE !== "true";
  const publicKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY ?? "";
  return <div className="two-thirds"><h1>Optional device research</h1>
    <p>This synthetic study uses Fingerprint in the EU to compare browser identification events. Joining sends browser/device signals and an opaque research session ID to Fingerprint. A browser identifier does not establish a person’s identity or whether they are human.</p>
    <p>Use synthetic people only. Participation is optional and cannot affect your tax claim, access or priority. Leaving this page stops new samples; it does not erase existing vendor records.</p>
    <p>Observatory keeps minimised study observations for seven days. Vendor retention depends on the configured Fingerprint workspace; the researcher must confirm that policy before enrolling participants.</p>
    <Study publicKey={publicKey} initialState={initialCoverage(enabled, publicKey)} enabled={enabled} />
    <p><a href="/">Continue to HMRC</a></p>
  </div>;
}

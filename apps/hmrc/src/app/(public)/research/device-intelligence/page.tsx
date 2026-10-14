import Study from "./study";
import { initialCoverage } from "@/lib/fingerprint-coverage";
export const dynamic = 'force-dynamic';

export default function DeviceIntelligence() {
  const enabled = process.env.FINGERPRINT_RESEARCH_ENABLED === "true" && process.env.PUBLIC_MODE !== "true";
  const publicKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY ?? "";
  return <div className="two-thirds"><h1>Optional device research</h1>
    <p>This synthetic study can use Fingerprint in the EU to compare browser identification events, and optionally BotD to observe local automation signals. When Fingerprint is configured, joining and collecting its sample sends browser/device signals and an opaque research session ID to Fingerprint. BotD samples run locally with vendor usage monitoring disabled. Neither signal establishes a person’s identity or whether an AI directed execution.</p>
    <p>Use synthetic people only. Participation is optional and cannot affect your tax claim, access or priority. Leaving this page stops new samples; it does not erase existing vendor records.</p>
    <p>Observatory keeps minimised study observations for seven days. Vendor retention depends on the configured Fingerprint workspace; the researcher must confirm that policy before enrolling participants.</p>
    <Study publicKey={publicKey} initialState={initialCoverage(enabled, publicKey)} enabled={enabled} botdEnabled={enabled && process.env.BOTD_RESEARCH_ENABLED === 'true'} />
    <p><a href="/">Continue to HMRC</a></p>
  </div>;
}

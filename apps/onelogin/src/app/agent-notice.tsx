import { headers } from "next/headers";
import { verifyAgentSignatureFromHeaders } from "@/lib/agent-identity";

/** Shown when the browser signs its requests as an AI agent. Sign-in is for people. */
export async function AgentNotice({ path }: { path: string }) {
  const sig = await verifyAgentSignatureFromHeaders(await headers(), "GET", path);
  if (!sig.verified) return null;
  return (
    <div className="ol-warning" role="note">
      <h2>This sign-in is for people</h2>
      <p>
        You’re using {sig.name}. An assistant should not sign in as someone, even with their details. If you’re acting for someone, go back to the
        service and use its “Act for someone” option. The person can then give you permission on GOV.UK.
      </p>
    </div>
  );
}

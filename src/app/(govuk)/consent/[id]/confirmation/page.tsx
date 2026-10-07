import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadRequest } from "@/lib/requests";
import { currentPrincipal } from "@/lib/session";

export const metadata: Metadata = { title: "Agent authorised" };

export default async function Confirmation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!principal) redirect("/consent-signin?returnTo=/account/delegates");
  const req = await loadRequest(id);
  if (!req || req.principalId !== principal.id || req.status !== "APPROVED") notFound();
  return (
    <div className="two-thirds">
      <div className="confirmation-panel">
        <h1>Agent authorised</h1>
        <p>{req.delegate.name} can now carry out the actions you approved with {req.service.name}.</p>
      </div>
      <p>You can remove this authority at any time.</p>
      <p>
        <Link href={`/account/delegates/${req.authorisationId}`}>View this authority</Link>
        {" · "}
        <Link href="/account/delegates">Your delegates</Link>
        {" · "}
        <Link href="/example-ai">Go to the Example AI assistant</Link>
      </p>
    </div>
  );
}

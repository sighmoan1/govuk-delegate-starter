import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";
import { revokeAction } from "@/app/(govuk)/actions";

export const metadata: Metadata = { title: "Remove access" };

export default async function Revoke({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/account/delegates/${id}/remove`)}`);
  const a = await prisma.authorisation.findUnique({ where: { id }, include: { delegate: true, service: true } });
  if (!a || a.principalId !== principal.id) notFound();
  if (a.status !== "ACTIVE") redirect(`/account/delegates/${id}`);
  return (
    <div className="two-thirds">
      <Link className="back-link" href={`/account/delegates/${id}`}>Back</Link>
      <h1>Remove {a.delegate.name}’s access?</h1>
      <p>It will no longer be able to carry out actions for you with {a.service.name}.</p>
      <form action={revokeAction}>
        <input type="hidden" name="id" value={id} />
        <div className="button-row">
          <button className="button" type="submit" style={{ background: "var(--error)", borderColor: "var(--error)" }}>Remove access</button>
          <Link className="button button--secondary" href={`/account/delegates/${id}`}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

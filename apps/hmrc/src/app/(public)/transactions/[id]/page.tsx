import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/guard";
import { transactionFor } from "@/lib/transactions";
import { TransactionPanel } from "./panel";

export const metadata: Metadata = { title: "Your claim" };
export const dynamic = "force-dynamic";

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/transactions/${id}`, "view_claim_status");
  // Only the person it is for, or an agent they have given this permission. Someone else's receipt is the same as none.
  const t = await transactionFor(viewer.taxpayer.oneLoginSubject, id);
  if (!t) notFound();
  return <TransactionPanel t={t} />;
}

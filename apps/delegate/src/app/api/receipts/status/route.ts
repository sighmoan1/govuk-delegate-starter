import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySecretCached } from "@/lib/secrets";
import { readJson } from "@/lib/http";

/** Which of these receipts has the person disputed? The service asks, then acts on its own records. */
export async function POST(req: Request) {
  const b = await readJson(req);
  const service = await prisma.service.findUnique({ where: { slug: String(b.service ?? "") } });
  const key = req.headers.get("x-service-key") ?? "";
  if (!service || !key || !verifySecretCached(key, service.apiKeyHash)) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : [];
  const rows = await prisma.receipt.findMany({ where: { id: { in: ids }, serviceId: service.id, status: "DISPUTED" }, select: { id: true } });
  return NextResponse.json({ disputed: rows.map((r) => r.id) });
}

// HMRC's synthetic records and the business handlers. No delegation logic here.
import { randomUUID } from "node:crypto";
import type { Taxpayer as TaxpayerRow } from "@/generated/prisma";
import { prisma } from "./db";
import type { Actor } from "./delegated-authority";

export type Taxpayer = TaxpayerRow;

export const TAX_YEAR = "2026 to 2027";
export const WFH_RELIEF = "£6 a week from 6 April 2026";
export const WFH_NEW_CODE = "1288L";

/**
 * Mock only: any One Login subject is a customer, with the same synthetic
 * starting position. The real HMRC would look the person up.
 */
export async function findOrCreateTaxpayer(subject: string, email?: string) {
  return prisma.taxpayer.upsert({
    where: { oneLoginSubject: subject },
    update: {},
    create: {
      oneLoginSubject: subject,
      name: email === "test@example.com" || !email ? "Sam Taylor" : email,
      taxCode: "1257L",
      employer: "Northwind Analytics Ltd",
      taxYear: TAX_YEAR,
    },
  });
}

const ref = (p: string) => `${p}-${randomUUID().slice(0, 8).toUpperCase()}`;
const who = (actor: Actor) => (actor.kind === "AGENT" ? { submittedBy: "AGENT" as const, agentName: actor.name } : { submittedBy: "SELF" as const });

export async function viewTaxCode(taxpayer: Taxpayer) {
  return { taxpayer: taxpayer.name, tax_year: taxpayer.taxYear, tax_code: taxpayer.taxCode, employer: taxpayer.employer, synthetic: true };
}

export async function claimJobExpenses(taxpayer: Taxpayer, actor: Actor) {
  const claim = await prisma.claim.create({
    data: { taxpayerId: taxpayer.id, reference: ref("JE"), kind: "job_expenses", summary: `Tax relief for working from home, ${WFH_RELIEF}`, newTaxCode: WFH_NEW_CODE, ...who(actor) },
  });
  await prisma.taxpayer.update({ where: { id: taxpayer.id }, data: { taxCode: WFH_NEW_CODE } });
  return { claim_reference: claim.reference, expense: "Working from home", tax_year: taxpayer.taxYear, relief: WFH_RELIEF, new_tax_code: WFH_NEW_CODE, synthetic: true };
}

export async function updateEmployment(taxpayer: Taxpayer, actor: Actor, body: Record<string, unknown>) {
  const summary = typeof body.details === "string" && body.details.trim() ? body.details.trim().slice(0, 200) : "Employment details updated";
  const claim = await prisma.claim.create({ data: { taxpayerId: taxpayer.id, reference: ref("EM"), kind: "employment_update", summary, ...who(actor) } });
  return { change_reference: claim.reference, update: summary, synthetic: true };
}

export async function changeRefundAccount(taxpayer: Taxpayer, actor: Actor) {
  const claim = await prisma.claim.create({ data: { taxpayerId: taxpayer.id, reference: ref("BA"), kind: "refund_account", summary: "Refund bank account changed (mock: no details held)", ...who(actor) } });
  return { change_reference: claim.reference, updated: true, synthetic: true };
}

export async function changeAddress(taxpayer: Taxpayer, actor: Actor) {
  const claim = await prisma.claim.create({ data: { taxpayerId: taxpayer.id, reference: ref("AD"), kind: "address", summary: "Address changed (mock: no address held)", ...who(actor) } });
  return { change_reference: claim.reference, updated: true, synthetic: true };
}

export const claimsFor = (taxpayerId: string) => prisma.claim.findMany({ where: { taxpayerId }, orderBy: { createdAt: "desc" } });

// Small helpers for the asynchronous path (issue #21): how a client asks for it,
// and which failures mean "HMRC could not durably store this".
import { Prisma } from "@/generated/prisma";

/**
 * `Prefer: respond-async` (RFC 7240): receive this now, process it later. The
 * client opts in, so existing callers keep the synchronous behaviour they have.
 */
export function prefersAsync(req: Request): boolean {
  const prefer = req.headers.get("prefer");
  return !!prefer && prefer.split(",").some((p) => p.split(";")[0].trim().toLowerCase() === "respond-async");
}

/**
 * The database could not be reached, the transaction timed out or was aborted,
 * or the database refused the write. Business refusals are not errors and never
 * come here; a bug in HMRC's own code does not either (it stays a 500).
 */
export function isStorageFailure(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientUnknownRequestError ||
    e instanceof Prisma.PrismaClientRustPanicError
  );
}

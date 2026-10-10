import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";

export type EmailAction = { operation: "signup" | "cancel"; property: string; email: string; reminderChoice: string };
export type EmailStatus = "submitted" | "confirmation_required" | "confirmed" | "unknown" | "refused";
export type EmailReceipt = { operationId: string; actionHash: string; status: EmailStatus; reason: string; updatedAt: string };
/** Connector-owned durable storage. Never put stop URLs or recipient details in public receipts. */
export interface ReceiptStore { get(id: string): Promise<EmailReceipt | undefined>; put(receipt: EmailReceipt): Promise<void>; }
export interface EmailSelectors { property: string; email: string; reminderChoice: string; submit: string; confirmed: string; confirmationRequired: string; challenge: string; refusal: string; submitted: string; }
export interface EmailConfig { origin: string; signupPath: string; selectors: EmailSelectors; allowLive?: { property: string; email: string }; }
export type EmailWorkflowInput = {
  page: Page; action: EmailAction; approvedAction: EmailAction; operationId: string; store: ReceiptStore; config: EmailConfig;
  /** Secret stop link obtained legitimately. Not part of receipts or evidence. */
  cancellationPath?: string;
  /** Must establish absence before another submission. Unknown never implies absence. */
  reconcile?: (action: EmailAction) => Promise<"confirmed" | "absent" | "unknown">;
};
export function actionHash(action: EmailAction): string {
  return createHash("sha256").update(JSON.stringify([action.operation, action.property, action.email, action.reminderChoice])).digest("hex");
}
/** Authority checks belong to the connector and must precede this function. Exact approval is an additional binding. */
export async function executeEmailWorkflow(input: EmailWorkflowInput): Promise<EmailReceipt> {
  const { page, action, approvedAction, operationId, store, config } = input;
  const hash = actionHash(action);
  const save = async (status: EmailStatus, reason: string) => {
    const receipt = { operationId, actionHash: hash, status, reason, updatedAt: new Date().toISOString() };
    await store.put(receipt); return receipt;
  };
  const prior = await store.get(operationId);
  if (prior && prior.actionHash !== hash) return { ...prior, status: "refused", reason: "OPERATION_CONFLICT" };
  if (hash !== actionHash(approvedAction)) return save("refused", "EXACT_APPROVAL_MISMATCH");
  if (!["signup", "cancel"].includes(action.operation) || !action.property || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(action.email) || !action.reminderChoice || !operationId)
    return save("refused", "INVALID_ACTION");
  const origin = new URL(config.origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (!local && (origin.protocol !== "https:" || config.allowLive?.property !== action.property || config.allowLive?.email !== action.email))
    return save("refused", "LIVE_TEST_NOT_DESIGNATED");
  if (prior) {
    if (prior.status === "confirmed" || prior.status === "refused") return prior;
    const observed = await input.reconcile?.(action).catch(() => "unknown" as const) ?? "unknown";
    if (observed === "confirmed") return save("confirmed", "RECONCILED_SERVICE_STATE");
    if (observed !== "absent") return prior;
  }
  // Persist uncertainty before any network mutation. Serialisation/operation locking belongs to caller/store.
  await save("unknown", "SUBMISSION_IN_PROGRESS");
  try {
    const target = new URL(action.operation === "signup" ? config.signupPath : input.cancellationPath ?? "", origin);
    if (target.origin !== origin.origin || (action.operation === "cancel" && !input.cancellationPath)) return save("refused", "INVALID_STOP_FLOW");
    await page.goto(target.href);
    if (new URL(page.url()).origin !== origin.origin) return save("refused", "UNEXPECTED_FORM_ORIGIN");
    const s = config.selectors;
    if (await page.locator(s.challenge).isVisible()) return save("confirmation_required", "HUMAN_CHALLENGE_REQUIRED");
    if (action.operation === "signup") {
      await page.locator(s.property).fill(action.property);
      await page.locator(s.email).fill(action.email);
      await page.locator(s.reminderChoice).selectOption(action.reminderChoice);
    }
    if (action.operation === "cancel") {
      const property = await page.locator(s.property).inputValue();
      const email = await page.locator(s.email).inputValue();
      const reminderChoice = await page.locator(s.reminderChoice).inputValue();
      if (property !== action.property || email !== action.email || reminderChoice !== action.reminderChoice)
        return save("refused", "STOP_FLOW_BINDING_MISMATCH");
    }
    await page.locator(s.submit).click();
    if (new URL(page.url()).origin !== origin.origin) return save("unknown", "UNEXPECTED_RESULT_ORIGIN");
    if (await page.locator(s.refusal).isVisible()) return save("refused", "SERVICE_REFUSAL");
    if (await page.locator(s.challenge).isVisible()) return save("confirmation_required", "HUMAN_CHALLENGE_REQUIRED");
    if (await page.locator(s.confirmationRequired).isVisible()) return save("confirmation_required", "INBOX_CONFIRMATION_REQUIRED");
    if (await page.locator(s.confirmed).isVisible()) return save("confirmed", "OBSERVED_SERVICE_CONFIRMATION");
    if (await page.locator(s.submitted).isVisible()) return save("submitted", "OBSERVED_FORM_SUBMISSION");
    return save("unknown", "NO_CONFIRMATION_EVIDENCE");
  } catch { return save("unknown", "BROWSER_OR_RESPONSE_UNCERTAIN"); }
}

export {executeWhenIsBinsEmailWorkflow,type NativeEmailInput,type NativeProperty} from './native';

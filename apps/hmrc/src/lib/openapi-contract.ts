// Machine-readable shapes for the public agent API; descriptions remain on the routes.
const str = { type: "string" };
const date = { type: "string", format: "date-time" };
const nullableDate = { type: ["string", "null"], format: "date-time" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });
const array = (items: unknown) => ({ type: "array", items });
const bool = { type: "boolean" };
export const apiSchemas = {
  ClaimRequest: object({ evidence: { ...str, description: "Optional evidence text. Deduplicated by trimmed, lowercased fingerprint; not evaluated for materiality." } }),
  EmploymentRequest: object({ details: { ...str, description: "Optional; the handler trims and stores at most 200 characters, or uses a generic summary." } }),
  AnswerRequest: object({ query_id: str, answer: { ...str, minLength: 1, maxLength: 1000 }, confirmed_by_person: { ...bool, default: false, description: "Optional agent assertion, not proof of agreement and not an acceptance gate." } }, ["query_id", "answer"]),
  RefundRequest: object({ account_name: { ...str, maxLength: 200 }, sort_code: { ...str, maxLength: 200 }, account_number: { ...str, maxLength: 200 } }, ["account_name", "sort_code", "account_number"]),
  AddressRequest: object({ address_line_1: { ...str, maxLength: 200 }, address_line_2: { ...str, maxLength: 200 }, town: { ...str, maxLength: 200 }, postcode: { ...str, maxLength: 200 } }, ["address_line_1", "town", "postcode"]),
  TaxCode: object({ taxpayer: str, tax_year: str, tax_code: str, employer: str, synthetic: { const: true } }, ["taxpayer", "tax_year", "tax_code", "employer", "synthetic"]),
  ClaimResult: object({ claim_reference: str, expense: str, tax_year: str, relief: str, new_tax_code: { type: ["string", "null"] }, synthetic: { const: true } }, ["claim_reference", "tax_year", "synthetic"]),
  ChangeResult: object({ change_reference: str, status: str, synthetic: { const: true } }, ["change_reference", "synthetic"]),
  AnswerResult: object({ claim_reference: str, query_id: str, status: str, person_approval: { enum: ["PERSON_SUBMITTED", "AGENT_ASSERTED", "NOT_DECLARED"] }, receipt_id: { type: ["string", "null"] }, synthetic: { const: true } }, ["claim_reference", "query_id", "person_approval", "synthetic"]),
  Claim: object({ reference: str, summary: str, kind: str, received: date, status: { enum: ["AWAITING_YOUR_REPLY", "BEING_REVIEWED"] }, open_queries: array(object({ query_id: str, question: str, asked: date, earlier_answer_withdrawn: str }, ["query_id", "question", "asked"])), answered_queries: { type: "integer", minimum: 0 } }, ["reference", "summary", "kind", "received", "status", "open_queries", "answered_queries"]),
  ClaimStatus: object({ taxpayer: str, claims: array(ref("Claim")), synthetic: { const: true }, dispute_check: { enum: ["OK", "UNAVAILABLE"] }, dispute_check_notice: str }, ["taxpayer", "claims", "synthetic", "dispute_check"]),
  Progress: { allOf: [ref("ClaimStatus"), object({ observed_at: date, checked_at: date, changed_since: { type: ["boolean", "null"] }, version: str, polling: object({ delivery: { const: "polling_only" }, push_or_webhooks: { const: false }, suggested_next_poll_seconds: { type: "integer" }, limit: object({ rule: str, checks: { type: "integer" }, per_seconds: { type: "integer" }, shared_by: str }), if_limited: str, conditional_requests: str }, ["delivery", "push_or_webhooks", "suggested_next_poll_seconds", "limit"]) }, ["observed_at", "checked_at", "changed_since", "version", "polling"])] },
  Transaction: object({ accepted: bool, transaction_id: str, operation: { const: "claim_job_expenses" }, status: { enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] }, status_meaning: str, status_url: str, received_at: date, receipt_note: str, submitted_by: object({ kind: { enum: ["SELF", "AGENT"] }, name: { type: ["string", "null"] } }, ["kind"]), attempts: { type: "integer" }, claim_reference: str, completed_at: nullableDate, failed_at: nullableDate, failure: object({ code: { const: "PROCESSING_FAILED" }, retry_with_new_request: { const: true } }), synthetic: { const: true } }, ["transaction_id", "operation", "status", "status_meaning", "status_url", "received_at", "receipt_note", "submitted_by", "attempts", "synthetic"]),
  Success: object({ decision: { const: "ALLOW" }, lane: str, acting_for: str, tell_the_person: str, delegate_check_id: str, result: { type: "object" }, capacity: { type: ["object", "null"], properties: { rule: str, limit: { type: "integer" }, used: { type: "integer" } } }, idempotent_replay: bool }, ["decision", "lane", "result"]),
  Refusal: object({ decision: { const: "DENY" }, reason: str, kind: { enum: ["AUTHORITY_REFUSAL", "BUSINESS_REFUSAL", "REQUEST_ERROR", "TECHNICAL_THROTTLE", "UNAVAILABLE"] }, lane: str, message: str, retryable: bool, retry_after_seconds: { type: "integer" }, entitlement_affected: { const: false }, accepted: { const: false }, scope: { enum: ["operator", "principal", "service"] }, cost_class: str, operation: str, rule: str, limit: { type: "integer" }, used: { type: "integer" }, window_seconds: { type: "integer" }, resets_at: nullableDate, step_up: object({ state: str, user_code: str, proposal_id: str, expires_at: date, details: { type: "object" } }) }, ["decision", "reason", "kind", "lane"]),
};
const success = (name: string) => ({ allOf: [ref("Success"), object({ result: ref(name) }, ["result"])] });
const json = (schema: unknown) => ({ "application/json": { schema } });
const replayHeader = { "Idempotent-Replayed": { schema: { type: "string", enum: ["true"] }, description: "The stored outcome was returned; no additional business effect." } };
const operationResults: Record<string, string> = { "/api/tax-code": "TaxCode", "/api/job-expenses": "ClaimResult", "/api/employment": "ChangeResult", "/api/refund-account": "ChangeResult", "/api/address": "ChangeResult", "/api/claims": "ClaimStatus", "/api/claims/progress": "Progress", "/api/claims/respond": "AnswerResult", "/api/transactions/{id}": "Transaction" };
const requestShapes: Record<string, string> = { "/api/job-expenses": "ClaimRequest", "/api/employment": "EmploymentRequest", "/api/refund-account": "RefundRequest", "/api/address": "AddressRequest", "/api/claims/respond": "AnswerRequest" };
export function applyApiContract(paths: Record<string, any>) {
  for (const [path, item] of Object.entries(paths)) {
    const op = item.get ?? item.post;
    if (!op) continue;
    op.responses["401"] = { description: "Identity not established. Unidentified callers can receive plain text; registered-agent refusals use the JSON shape." };
    for (const [status, response] of Object.entries(op.responses) as [string, any][]) {
      if (status === "304") continue; // HTTP 304 has no content.
      response.content = status === "200" ? json(success(operationResults[path])) : status === "202" ? json(success("Transaction")) : json(ref("Refusal"));
      if (status === "401" || status === "429") response.content["text/plain"] = { schema: str };
      if (["200", "202"].includes(status) && ["/api/job-expenses", "/api/claims/respond", "/api/refund-account", "/api/address"].includes(path)) response.headers = { ...response.headers, ...replayHeader };
    }
    if (requestShapes[path]) op.requestBody = { required: !["/api/job-expenses", "/api/employment"].includes(path), content: json(ref(requestShapes[path])) };
    if (["/api/job-expenses", "/api/claims/respond", "/api/refund-account", "/api/address"].includes(path)) op.parameters.push({ name: "Idempotency-Key", in: "header", required: ["/api/refund-account", "/api/address"].includes(path), schema: { type: "string", minLength: 1, maxLength: 128, pattern: "^[!-~]+$" }, description: "Fresh key per intended operation. Same key/payload returns the original outcome; changed payload gives 409. Required also for asynchronous claims." });
    if (path === "/api/job-expenses") op.parameters.push({ name: "Prefer", in: "header", required: false, schema: str, description: "respond-async opts into durable receipt and requires Idempotency-Key." });
  }
  return paths;
}

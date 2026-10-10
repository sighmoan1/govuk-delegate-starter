import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeEmailWorkflow, type EmailAction } from "../src";
import { MemoryReceiptStore, startEmailFixture } from "../src/fixture";
const action: EmailAction = { operation:"signup", property:"synthetic-property-1",email:"sam.test@example.invalid",reminderChoice:"evening_before" };
let browser: Browser, page: Page, fixture: Awaited<ReturnType<typeof startEmailFixture>>, store: MemoryReceiptStore;
beforeAll(async()=>{browser=await chromium.launch({headless:true});});
afterAll(async()=>{await browser.close();});
beforeEach(async()=>{fixture=await startEmailFixture();page=await browser.newPage();store=new MemoryReceiptStore();});
afterEach(async()=>{await page.close();await fixture.close();});
const execute = (extra: Partial<Parameters<typeof executeEmailWorkflow>[0]> = {}) => executeEmailWorkflow({ page, action,approvedAction:action,operationId:"signup-1",store,config:fixture.config,reconcile:fixture.reconcile,...extra });
describe("scoped synthetic browser email workflow",()=>{
  it("submits a real CSRF-protected form, waits for inbox evidence and cancels separately",async()=>{
    expect((await execute()).status).toBe("confirmation_required");
    expect(fixture.counts()).toEqual({submissions:1,cancellations:0});
    expect((await execute()).status).toBe("confirmation_required");
    expect(fixture.counts().submissions).toBe(1);
    fixture.mailbox.confirm(action);
    expect((await execute()).reason).toBe("RECONCILED_SERVICE_STATE");
    const cancel={...action,operation:"cancel" as const};
    const result=await execute({action:cancel,approvedAction:cancel,operationId:"cancel-1",cancellationPath:fixture.mailbox.stopPath(action)});
    expect(result.status).toBe("confirmed");expect(fixture.counts().cancellations).toBe(1);
    expect(JSON.stringify(result)).not.toContain("/stop/");
    expect(JSON.stringify(result)).not.toContain(action.email);
  });
  it.each(["property","email","reminderChoice","operation"] as const)("refuses replacement of approved %s before navigation",async field=>{
    const changed={...action,[field]:field==="operation"?"cancel":"substituted"} as EmailAction;
    expect((await execute({action:changed})).reason).toBe("EXACT_APPROVAL_MISMATCH");
    expect(page.url()).toBe("about:blank");expect(fixture.counts().submissions).toBe(0);
  });
  it("keeps human challenges pending without trying to bypass them",async()=>{
    fixture.setMode("challenge"); expect((await execute()).reason).toBe("HUMAN_CHALLENGE_REQUIRED");expect(fixture.counts().submissions).toBe(0);
  });
  it("distinguishes form receipt from subscription confirmation",async()=>{
    fixture.setMode("submitted");expect((await execute()).status).toBe("submitted");
  });
  it("records explicit service refusal",async()=>{
    fixture.setMode("refuse");expect((await execute()).status).toBe("refused");expect(fixture.counts().submissions).toBe(0);
  });
  it("does not resubmit a lost response and reconciles it after inbox confirmation",async()=>{
    fixture.setMode("lost");expect((await execute()).status).toBe("unknown");
    fixture.setMode("normal");expect((await execute()).status).toBe("unknown");expect(fixture.counts().submissions).toBe(1);
    fixture.mailbox.confirm(action);expect((await execute()).status).toBe("confirmed");expect(fixture.counts().submissions).toBe(1);
  });
  it("refuses a conflicting operation key without rewriting its receipt",async()=>{
    await execute();const changed={...action,email:"another@example.invalid"};
    expect((await execute({action:changed,approvedAction:changed})).reason).toBe("OPERATION_CONFLICT");expect((await store.get("signup-1"))?.status).toBe("confirmation_required");
  });
  it("requires a designated live property and inbox and stops foreign stop links",async()=>{
    expect((await execute({config:{...fixture.config,origin:"https://whenisbins.com"}})).reason).toBe("LIVE_TEST_NOT_DESIGNATED");
    const cancel={...action,operation:"cancel" as const};
    expect((await execute({action:cancel,approvedAction:cancel,operationId:"cancel",cancellationPath:"https://example.com/stop"})).reason).toBe("INVALID_STOP_FLOW");
  });
  it("refuses a stop link bound to a different approved recipient",async()=>{
    await execute();fixture.mailbox.confirm(action);
    const cancel={...action,operation:"cancel" as const,email:"wrong@example.invalid"};
    expect((await execute({action:cancel,approvedAction:cancel,operationId:"wrong-stop",cancellationPath:fixture.mailbox.stopPath(action)})).reason).toBe("STOP_FLOW_BINDING_MISMATCH");
    expect(fixture.counts().cancellations).toBe(0);
  });
  it("records browser timeout or closure as uncertainty",async()=>{
    await page.close();expect((await execute()).reason).toBe("BROWSER_OR_RESPONSE_UNCERTAIN");
  });
  it("rejects an invalid runtime operation",async()=>{
    const invalid={...action,operation:"other"} as unknown as EmailAction;
    expect((await execute({action:invalid,approvedAction:invalid})).reason).toBe("INVALID_ACTION");expect(page.url()).toBe("about:blank");
  });
  it("website rejects a forged CSRF submission",async()=>{
    const result=await page.request.post(fixture.config.origin+"/signup",{form:{csrf:"fake",property:action.property,email:action.email,reminderChoice:action.reminderChoice}});
    expect(result.status()).toBe(403);expect(fixture.counts().submissions).toBe(0);
  });
});

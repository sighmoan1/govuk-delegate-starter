import {chromium,type Browser,type Page} from '@playwright/test';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {executeWhenIsBinsEmailWorkflow,type EmailAction} from '../src';import {MemoryReceiptStore} from '../src/fixture';
let browser:Browser,page:Page,store:MemoryReceiptStore,posts:number,status:number,wrongProperty:boolean;
const property={postcode:'ZZ1 1ZZ',address:'1 Synthetic Road',propertyId:'p:synthetic',websiteLookupId:'11111111-1111-1111-1111-111111111111'};
const action:EmailAction={operation:'signup',property:property.address,email:'test@example.invalid',reminderChoice:'evening_before'};
beforeAll(async()=>{browser=await chromium.launch({headless:true});});afterAll(async()=>{await browser.close();});
beforeEach(async()=>{page=await browser.newPage();store=new MemoryReceiptStore();posts=0;status=200;wrongProperty=false;
 await page.route('**/*',async route=>{const request=route.request(),path=new URL(request.url()).pathname;if(request.method()==='POST'){posts++;expect(path).toBe('/remind');const data=new URLSearchParams(request.postData()!);expect(data.get('email')).toBe(action.email);expect(data.get('property_id')).toBe(property.propertyId);expect(data.get('_csrf')).toBe('synthetic-token');return route.fulfill({status,contentType:'text/html',body:'<h1>Request processed</h1>'});}
 return route.fulfill({status:200,contentType:'text/html',body:`<h1>Your bin days</h1><form action="/remind" method="post"><input type="hidden" name="_csrf" value="synthetic-token"><input type="hidden" name="property_id" value="${wrongProperty?'p:wrong':property.propertyId}"><input type="email" name="email"><button type="submit">Email me reminders</button></form>`});});});
afterEach(async()=>{await page.close();});
const execute=(extra:Partial<Parameters<typeof executeWhenIsBinsEmailWorkflow>[0]>={})=>executeWhenIsBinsEmailWorkflow({page,action,approvedAction:action,operationId:'native-operation',store,property,designated:{...property,email:action.email},...extra});
describe('mapped native WhenIsBins form with hermetic network interception',()=>{
 it('reuses known lookup and sends native hidden property/CSRF with the exact recipient',async()=>{expect((await execute()).status).toBe('submitted');expect(posts).toBe(1);});
 it('does not guess success from a click or resubmit a pending outcome',async()=>{await execute();expect((await execute()).status).toBe('submitted');expect(posts).toBe(1);expect((await execute({reconcile:async()=> 'confirmed'})).status).toBe('confirmed');expect(posts).toBe(1);});
 it('refuses a different native property before submission',async()=>{wrongProperty=true;expect((await execute()).reason).toBe('PROPERTY_BINDING_MISMATCH');expect(posts).toBe(0);});
 it('refuses recipient replacement and missing designation before navigation',async()=>{expect((await execute({action:{...action,email:'other@example.invalid'}})).reason).toBe('EXACT_APPROVAL_MISMATCH');expect(page.url()).toBe('about:blank');expect(posts).toBe(0);});
 it('records real HTTP refusal rather than submitted success',async()=>{status=403;expect((await execute()).reason).toBe('NATIVE_SERVICE_REFUSAL');expect(posts).toBe(1);});
 it('refuses foreign stop links',async()=>{const cancel={...action,operation:'cancel' as const};expect((await execute({action:cancel,approvedAction:cancel,cancellationPath:'https://example.test/stop'})).reason).toBe('INVALID_STOP_FLOW');expect(posts).toBe(0);});
});

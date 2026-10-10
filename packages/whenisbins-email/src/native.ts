import type {Page} from '@playwright/test';
import {actionHash,type EmailAction,type EmailReceipt,type ReceiptStore} from './index';
export type NativeProperty={postcode:string;address:string;propertyId?:string;websiteLookupId?:string};
export type NativeEmailInput={page:Page;action:EmailAction;approvedAction:EmailAction;operationId:string;store:ReceiptStore;property:NativeProperty;designated:NativeProperty&{email:string};cancellationPath?:string;reconcile?:(action:EmailAction)=>Promise<'confirmed'|'absent'|'unknown'>};
const origin='https://whenisbins.com';
/** Actual unchanged WhenIsBins HTML flow; requires a privately designated property/inbox and caller-enforced Delegate approval. */
export async function executeWhenIsBinsEmailWorkflow(input:NativeEmailInput):Promise<EmailReceipt>{
 const {page,action,approvedAction,operationId,store,property,designated}=input,hash=actionHash(action);
 const save=async(status:EmailReceipt['status'],reason:string)=>{const r={operationId,actionHash:hash,status,reason,updatedAt:new Date().toISOString()};await store.put(r);return r;};
 const prior=await store.get(operationId);
 if(prior&&prior.actionHash!==hash)return {...prior,status:'refused',reason:'OPERATION_CONFLICT'};
 if(hash!==actionHash(approvedAction)||property.address!==action.property||designated.address!==property.address||designated.postcode!==property.postcode||designated.propertyId!==property.propertyId||designated.email!==action.email||action.reminderChoice!=='evening_before'||!['signup','cancel'].includes(action.operation)||!operationId)return save('refused','EXACT_APPROVAL_MISMATCH');
 if(prior){if(['confirmed','refused'].includes(prior.status))return prior;const observed=await input.reconcile?.(action).catch(()=>'unknown' as const)??'unknown';if(observed==='confirmed')return save('confirmed','INDEPENDENT_SERVICE_OR_MAILBOX_EVIDENCE');if(observed!=='absent')return prior;}
 await save('unknown','SUBMISSION_IN_PROGRESS');
 try{
  page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(20000);
  if(action.operation==='signup'){
   if(!property.propertyId)return save('refused','EXACT_NATIVE_PROPERTY_REQUIRED');
   if(property.websiteLookupId){if(!/^[0-9a-f-]{36}$/i.test(property.websiteLookupId))return save('refused','INVALID_LOOKUP_REFERENCE');await page.goto(origin+'/lookup/'+property.websiteLookupId);}
   else{
    await page.goto(origin);await page.locator('input[name="postcode"]').fill(property.postcode);await page.getByRole('button',{name:'Find my bin day',exact:true}).click();
    let selected=false;for(const radio of await page.locator('input[name="property_id"]').all()){if(await radio.inputValue()===property.propertyId){await radio.check();selected=true;break;}}
    if(!selected)return save('refused','EXACT_NATIVE_PROPERTY_REQUIRED');await page.getByRole('button',{name:'Continue',exact:true}).click();
   }
   if(new URL(page.url()).origin!==origin)return save('refused','UNEXPECTED_FORM_ORIGIN');
   const form=page.locator('form[action="/remind"]');await form.waitFor({state:'visible'});
   if(await form.locator('input[name="property_id"]').inputValue()!==property.propertyId)return save('refused','PROPERTY_BINDING_MISMATCH');
   if(!await form.locator('input[name="_csrf"]').inputValue())return save('refused','SITE_PROTECTION_MISSING');
   await form.locator('input[type="email"][name="email"]').fill(action.email);
   const [submitted]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).origin===origin&&new URL(r.url()).pathname==='/remind'),form.getByRole('button',{name:'Email me reminders',exact:true}).click()]);
   if(submitted.status()>=400)return save('refused','NATIVE_SERVICE_REFUSAL');
  }else{
   if(!input.cancellationPath)return save('refused','OWNED_STOP_LINK_REQUIRED');
   const stop=new URL(input.cancellationPath,origin);if(stop.origin!==origin||stop.username||stop.password)return save('refused','INVALID_STOP_FLOW');
   // Caller supplies a secret stop URL bound to independently read mail for this exact approved subscription.
   await page.goto(stop.href);
   return save('confirmation_required','STOP_FORM_MAPPING_REQUIRED');
  }
  if(new URL(page.url()).origin!==origin)return save('unknown','UNEXPECTED_RESULT_ORIGIN');
  // The real post-signup success/refusal DOM is mapped only after the first separately approved live submission.
  return save('submitted','NATIVE_FORM_SUBMITTED_AWAITING_INDEPENDENT_EVIDENCE');
 }catch{return save('unknown','BROWSER_OR_RESPONSE_UNCERTAIN');}
}

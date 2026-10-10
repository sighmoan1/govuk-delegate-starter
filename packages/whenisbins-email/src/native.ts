import type {Page} from '@playwright/test';
import {actionHash,type EmailAction,type EmailReceipt,type ReceiptStore} from './index';
export type NativeProperty={postcode:string;address:string;propertyId?:string;websiteLookupId?:string};
export type NativeEmailInput={page:Page;action:EmailAction;approvedAction:EmailAction;operationId:string;store:ReceiptStore;property:NativeProperty;designated:NativeProperty&{email:string};cancellationPath?:string;confirmationPath?:string;reconcile?:(action:EmailAction)=>Promise<'confirmed'|'absent'|'unknown'>};
const origin='https://whenisbins.com';
/** Actual unchanged WhenIsBins HTML flow; requires a privately designated property/inbox and caller-enforced Delegate approval. */
export async function executeWhenIsBinsEmailWorkflow(input:NativeEmailInput):Promise<EmailReceipt>{
 const {page,action,approvedAction,operationId,store,property,designated}=input,hash=actionHash(action);
 const save=async(status:EmailReceipt['status'],reason:string)=>{const r={operationId,actionHash:hash,status,reason,updatedAt:new Date().toISOString()};await store.put(r);return r;};
 const prior=await store.get(operationId);
 if(prior&&prior.actionHash!==hash)return {...prior,status:'refused',reason:'OPERATION_CONFLICT'};
 if(hash!==actionHash(approvedAction)||property.address!==action.property||designated.address!==property.address||designated.postcode!==property.postcode||designated.propertyId!==property.propertyId||designated.email!==action.email||action.reminderChoice!=='evening_before'||!['signup','cancel'].includes(action.operation)||!operationId)return save('refused','EXACT_APPROVAL_MISMATCH');
 if(prior){if(['confirmed','refused'].includes(prior.status))return prior;const observed=await input.reconcile?.(action).catch(()=>'unknown' as const)??'unknown';if(observed==='confirmed')return save('confirmed','INDEPENDENT_SERVICE_OR_MAILBOX_EVIDENCE');if(input.confirmationPath){
  if(action.operation!=='signup'||!['submitted','confirmation_required'].includes(prior.status)||['CONFIRMATION_VISIT_AWAITING_INDEPENDENT_EVIDENCE','CONFIRMATION_POST_AWAITING_INDEPENDENT_EVIDENCE'].includes(prior.reason))return prior;
  let verification:URL;try{verification=new URL(input.confirmationPath);}catch{return {...prior,status:'refused',reason:'INVALID_CONFIRMATION_FLOW'};}
  if(verification.origin!==origin||verification.username||verification.password||verification.search||verification.hash||!/^\/verify\/[A-Za-z0-9_-]+$/.test(verification.pathname))return {...prior,status:'refused',reason:'INVALID_CONFIRMATION_FLOW'};
  await save('unknown','CONFIRMATION_VISIT_IN_PROGRESS');
  try{page.setDefaultNavigationTimeout(20000);const response=await page.goto(verification.href);if(!response||response.status()>=400||new URL(page.url()).origin!==origin)return save('unknown','CONFIRMATION_RESPONSE_UNCERTAIN');
   const activation=page.locator('form[method="post"]');
   if(await page.getByRole('heading',{name:'Turn on bin reminders?',exact:true}).count()!==1||await activation.count()!==1)return save('submitted','CONFIRMATION_VISIT_AWAITING_INDEPENDENT_EVIDENCE');
   if(new URL(await activation.getAttribute('action')??'',origin).href!==verification.href||!await activation.locator('input[name="_csrf"]').inputValue())return save('refused','INVALID_CONFIRMATION_FORM');
   await save('unknown','CONFIRMATION_POST_IN_PROGRESS');
   const [activated]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===verification.href),activation.getByRole('button',{name:'Turn on reminders',exact:true}).click()]);
   if(activated.status()>=500)return save('unknown','CONFIRMATION_RESPONSE_UNCERTAIN');
   if(activated.status()>=400)return save('refused','NATIVE_CONFIRMATION_REFUSAL');
   if(new URL(page.url()).origin===origin&&await page.getByRole('heading',{name:'Your reminders are on',exact:true}).count()===1)return save('confirmed','NATIVE_CONFIRMATION_OBSERVED');
   return save('submitted','CONFIRMATION_POST_AWAITING_INDEPENDENT_EVIDENCE');
  }catch{return save('unknown','CONFIRMATION_RESPONSE_UNCERTAIN');}
 }if(observed!=='absent')return prior;}
 if(input.confirmationPath)return save('refused','OWNED_PENDING_SIGNUP_REQUIRED');
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
   if(submitted.status()>=500)return save('unknown','BROWSER_OR_RESPONSE_UNCERTAIN');
   if(submitted.status()>=400)return save('refused','NATIVE_SERVICE_REFUSAL');
  }else{
   if(!input.cancellationPath)return save('refused','OWNED_STOP_LINK_REQUIRED');
   const stop=new URL(input.cancellationPath,origin);if(stop.origin!==origin||stop.username||stop.password)return save('refused','INVALID_STOP_FLOW');
   // Caller supplies a secret stop URL bound to independently read mail for this exact approved subscription.
   await page.goto(stop.href);
   return save('confirmation_required','STOP_FORM_MAPPING_REQUIRED');
  }
  if(new URL(page.url()).origin!==origin)return save('unknown','UNEXPECTED_RESULT_ORIGIN');
  if(await page.getByRole('heading',{name:'Check your email',exact:true}).count())return save('confirmation_required','INBOX_CONFIRMATION_REQUIRED');
  return save('submitted','NATIVE_FORM_SUBMITTED_AWAITING_INDEPENDENT_EVIDENCE');
 }catch{return save('unknown','BROWSER_OR_RESPONSE_UNCERTAIN');}
}

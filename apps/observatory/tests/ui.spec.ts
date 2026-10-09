import { expect, test } from "@playwright/test";
test("dashboard access, missing evidence and mobile keyboard use", async ({ page }) => {
 await page.setViewportSize({width:320,height:900}); await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Understand automated service activity');
 await expect(page.getByRole('note')).toContainText('no human study results yet');
 await expect(page.getByText('Ground truth and experiment provenance are hidden.')).toBeVisible();
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to main content'})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Load or refresh events'}).click();await expect(page.getByRole('status')).toContainText(/Access (not configured|key required)/);
 await page.screenshot({path:'ci-artifacts/observatory-320.png',fullPage:true});
});
test("loaded source evidence keeps protected truth out of monitoring", async ({ page })=>{
 const missing={value:null,status:'missing',provenance:'not_recorded'};
 const event={schema_version:1,source_service:'hmrc',source_event_id:'fixture-event',event_kind:'service_request',occurred_at:{value:'2026-10-09T10:00:00.000Z',status:'known',provenance:'source_clock'},run_id:missing,correlation:{request_id:missing,transaction_id:missing,session_id:missing,delegate_check_id:missing},observed:{lane:'UNKNOWN',signature_verified:missing,latency_ms:missing},outcome:{decision:'REFUSED',outcome_class:missing,cost_class:missing},browser_sensor:{status:'not_run',provenance:'not_collected'}};
 await page.route('**/api/dashboard?*',route=>route.fulfill({json:{events:[{id:'fixture',receivedAt:event.occurred_at.value,event,binding:null}],invalid:0,truncated:false,refreshedAt:event.occurred_at.value}}));
 await page.route('**/api/monitoring/classifications',route=>route.fulfill({status:404,json:{error:'not configured'}}));
 await page.goto('/');await page.getByLabel('Collection access key').fill('synthetic-browser-fixture');await page.getByRole('button',{name:'Load or refresh events'}).click();
 await expect(page.getByText('No automation score is invented.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Explore hmrc event fixture-event'}).click();
 await expect(page.getByRole('heading',{name:'Event evidence explorer'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Protected ground truth'})).toHaveCount(0);
 await page.getByLabel('View',{exact:true}).selectOption('research');await expect(page.getByRole('heading',{name:'Event evidence explorer'})).toHaveCount(0);await expect(page.getByLabel('Evaluation access key')).toHaveValue('');
});

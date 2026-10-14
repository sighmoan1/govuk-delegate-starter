import { expect, test } from '@playwright/test';
test('comparison access and mobile keyboard layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto('/workbench');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compare detection evidence');
  await expect(page.getByRole('button', { name: 'Run comparison and ablations' })).toBeDisabled();
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Research evaluation key').fill('evaluation-only-synthetic-fixture-0123456789');
  await expect(page.getByRole('button', { name: 'Run comparison and ablations' })).toBeEnabled();
});
test('clearing research discards an outstanding protected response', async ({ page }) => {
  let finish: (() => Promise<void>) | undefined;
  await page.route('**/api/evaluation/comparisons', route => { finish = () => route.fulfill({ json: { report: { schema: 'observatory-evaluation/1', mode: 'synthetic_fixture' } } }); });
  await page.goto('/workbench'); await page.getByLabel('Research evaluation key').fill('evaluation-only-synthetic-fixture-0123456789');
  await page.getByRole('button', { name: 'Run comparison and ablations' }).click(); await expect.poll(() => !!finish).toBe(true);
  await page.getByRole('button', { name: 'Clear research' }).click(); await finish!();
  await expect(page.getByRole('status')).toHaveText('Research cleared from page memory.');
  await expect(page.getByRole('heading', { name: 'Synthetic fixture results' })).toHaveCount(0);
  await expect(page.getByLabel('Research evaluation key')).toHaveValue('');
});

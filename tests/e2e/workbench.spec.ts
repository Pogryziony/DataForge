import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => { await page.goto(''); });
async function generate(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Generate data', exact: true }).first().click();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
}
test('generates deterministic CPR and exports full JSON', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await generate(page);
  await expect(page.locator('tbody tr')).toHaveCount(10);
  const initial = await page.locator('tbody').textContent();
  await generate(page);
  await expect(page.locator('tbody')).toHaveText(initial!);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export full result' }).click();
  const download = await downloadPromise;
  const records = JSON.parse(await readFile((await download.path())!, 'utf8')) as { value: string }[];
  expect(records).toHaveLength(10);
  records.forEach(row => expect(row.value).toMatch(/^\d{6}-\d{4}$/));
  expect(errors).toEqual([]);
});
test('generates PESEL and prevents DAR claims without a reference pool', async ({ page }) => {
  await page.getByLabel('Data type', { exact: true }).selectOption('pesel');
  await generate(page);
  await expect(page.locator('tbody tr').first()).toContainText(/\d{11}/);
  await page.getByLabel('Data type', { exact: true }).selectOption('dar');
  await page.getByRole('button', { name: 'Generate data', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('DAR_POOL_REQUIRED');
  await expect(page.getByRole('button', { name: 'Export full result' })).toBeDisabled();
});
test('saves a template and loads it after reload', async ({ page }) => {
  await page.getByRole('link', { name: 'Schema designer', exact: true }).click();
  await page.getByLabel('Schema name').fill('Saved Danish customer');
  await page.getByRole('button', { name: /Save template/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Template saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: /Templates/ }).click();
  await page.getByRole('button', { name: /Saved Danish customer/ }).click();
  await expect(page.getByLabel('Schema name')).toHaveValue('Saved Danish customer');
  await generate(page);
});
test('creates negative cases with explicit validation metadata', async ({ page }) => {
  await page.getByRole('link', { name: 'Negative cases', exact: true }).click();
  await page.getByLabel('Target field').selectOption('cpr');
  await page.getByLabel('Mutation', { exact: true }).selectOption('missing');
  await generate(page);
  await expect(page.locator('thead')).toContainText('_testCase');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.locator('.json-preview')).toContainText('REQUIRED');
});
test('builds relational datasets and constrained pairwise coverage', async ({ page }) => {
  await page.getByRole('link', { name: 'Dataset builder', exact: true }).click();
  await page.getByRole('button', { name: 'Build dataset', exact: true }).click();
  await expect(page.getByLabel('Dataset', { exact: true })).toBeVisible({ timeout: 45000 });
  await page.getByLabel('Dataset', { exact: true }).selectOption('orders');
  await page.getByRole('button', { name: 'Pairwise', exact: true }).click();
  await page.getByRole('button', { name: 'Build dataset', exact: true }).click();
  await expect(page.getByText(/Complete coverage/)).toBeVisible();
});
test('imports CSV, masks locally and does not run payload text', async ({ page }) => {
  await page.getByRole('link', { name: 'Import & transform', exact: true }).click();
  await page.getByLabel('Import JSON or CSV').setInputFiles({ name: 'input.csv', mimeType: 'text/csv', buffer: Buffer.from('email,id\nprivate@example.com,00001\n') });
  await page.getByRole('button', { name: 'Transform locally' }).click();
  await expect(page.locator('tbody')).toContainText('00001');
  await expect(page.locator('tbody')).not.toContainText('private@example.com');
});
test('imports JSON Schema and verifies generated constraints', async ({ page }) => {
  await page.getByRole('link', { name: 'Schema designer', exact: true }).click();
  const schema = { type: 'object', required: ['code'], properties: { code: { type: 'string', pattern: '^[A-Z]{5}$' } } };
  await page.getByLabel('Import configuration or JSON Schema').setInputFiles({ name: 'schema.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(schema)) });
  await expect(page.getByLabel('Field name 1', { exact: true })).toHaveValue('code');
  await generate(page);
  await expect(page.locator('tbody tr').first()).toContainText(/[A-Z]{5}/);
});
test('changes interface language and remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Interface language').selectOption('pl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Szybkie generowanie');
  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.width + 1);
  await page.getByRole('button', { name: 'Generuj dane', exact: true }).first().click();
  await expect(page.locator('tbody tr')).toHaveCount(10, { timeout: 45000 });
});
test('generates offline after the production service worker is ready', async ({ page, context }) => {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.getByLabel('Data type', { exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Data type', { exact: true }).selectOption('cpr');
  await generate(page);
  await context.setOffline(false);
});
test('cancels a large generation without retaining partial results', async ({ page }) => {
  await page.getByLabel('Records', { exact: true }).fill('100000');
  await page.getByRole('button', { name: 'Generate data', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText(/Partial results were discarded/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export full result' })).toBeDisabled();
});

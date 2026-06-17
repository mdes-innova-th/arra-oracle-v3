import { expect, test, type Page } from '@playwright/test';

const apiHost = process.env.ORACLE_E2E_API_HOST ?? `127.0.0.1:${process.env.PLAYWRIGHT_BACKEND_PORT ?? '47778'}`;
const healthUrl = `http://${apiHost}/api/health`;

async function expectReady(page: Page) {
  await expect(page.getByText('Backend unavailable')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Refresh data|Refreshing/ })).toBeVisible();
}

test.describe('hosted Studio to local Oracle deploy chain', () => {
  test('host query connects the browser app to the local Oracle API', async ({ page }) => {
    const health = page.waitForResponse((response) => response.url() === healthUrl && response.ok());

    await page.goto(`/?host=${encodeURIComponent(apiHost)}`);
    await health;

    await expect.poll(() => new URL(page.url()).searchParams.has('host')).toBe(false);
    await expectReady(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('oracle.host'))).toBe(apiHost);
  });

  test('stored host connects a clean hosted Studio URL on reload', async ({ page }) => {
    await page.addInitScript((host) => localStorage.setItem('oracle.host', host), apiHost);
    const health = page.waitForResponse((response) => response.url() === healthUrl && response.ok());

    await page.goto('/');
    await health;

    await expect.poll(() => new URL(page.url()).searchParams.has('host')).toBe(false);
    await expectReady(page);
  });
});

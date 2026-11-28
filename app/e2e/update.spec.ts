import { type Page, expect, test } from '@playwright/test';

/**
 * Stabile Updates (Phase 5, AP-14, ADR-0021, TC-163, TC-166). Die E2E-Builds tragen Update #100
 * (vite --mode e2e); der Server meldet über /api/v1/health eine höhere Nummer.
 */
test.use({ serviceWorkers: 'block' });

async function server(page: Page, pr: string) {
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', version: '1.0.1', environment: 'prod', build: { pr, sha: '', time: '' } }),
    }),
  );
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{"status":401}' }),
  );
}

test('Neuere Version am Server: Hinweis, Neuladen, danach Zurücksetzen (TC-163)', async ({ page }) => {
  await server(page, '205');
  await page.goto('/');
  const banner = page.getByTestId('update-banner');
  await expect(banner).toContainText('Neue Version da (Update #205)');
  await banner.getByRole('button', { name: 'Jetzt laden' }).click();
  // Die Test-App bleibt #100: Neuladen hat nicht geholfen, jetzt wird Zurücksetzen angeboten
  await expect(banner).toContainText('kommt nicht an');
  await expect(banner.getByRole('button', { name: 'App zurücksetzen' })).toBeVisible();
});

test('Gleicher oder älterer Stand am Server: kein Hinweis', async ({ page }) => {
  await server(page, '100');
  await page.goto('/');
  await expect(page.getByTestId('build')).toBeVisible();
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('Während eines Matches wartet der Hinweis (N-06)', async ({ page }) => {
  await server(page, '205');
  await page.goto('/');
  await expect(page.getByTestId('update-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Freies Match' }).click();
  await page.getByRole('button', { name: 'Weiter zum W20-Wurf' }).click();
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('App zurücksetzen im Profil behält den Spielstand (TC-166)', async ({ page }) => {
  await server(page, '100');
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', email: 'anna@example.org', display_name: 'Anna', favorite_colors: '', locale: 'de', has_passkey: true, groups: [] }),
    }),
  );
  await page.route('**/api/v1/me/deleted-groups', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  // Spielstand in IndexedDB anlegen, der das Zurücksetzen überleben muss
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('topstack-reset-probe', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('s');
        open.onsuccess = () => {
          const tx = open.result.transaction('s', 'readwrite');
          tx.objectStore('s').put('noch da', 'k');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.goto('/profil');
  await page.getByRole('button', { name: 'App zurücksetzen' }).click();
  await page.getByRole('button', { name: 'Jetzt zurücksetzen' }).click();
  await expect(page).toHaveURL(/\/$/);
  const kept = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('topstack-reset-probe', 1);
        open.onsuccess = () => {
          const get = open.result.transaction('s').objectStore('s').get('k');
          get.onsuccess = () => resolve(String(get.result));
        };
      }),
  );
  expect(kept).toBe('noch da');
});

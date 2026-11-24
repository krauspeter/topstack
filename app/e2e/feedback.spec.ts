import { type Route, expect, test } from '@playwright/test';

/** Feedback-Button (AP-5, TC-108): Formular, Text, Screenshot, Antwort des Servers. */
test.use({ serviceWorkers: 'block' });

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    json(route, 200, {
      id: 'u1',
      email: 'peter@example.org',
      display_name: 'Peter',
      favorite_colors: '',
      locale: 'de',
      has_passkey: true,
      groups: [],
    }),
  );
});

test('Feedback mit Screenshot senden', async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/v1/feedback', (route) => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    return json(route, 201, { id: 'f1' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Feedback geben' }).click();
  await expect(page).toHaveURL(/\/feedback$/);
  await expect(page.getByText('nur eine anonyme Kennung')).toBeVisible();

  await page.getByRole('button', { name: 'Wunsch' }).click();
  await expect(page.getByLabel('Was hast du gerade gemacht? (optional)')).toHaveCount(0); // nur bei Fehlern
  await page.getByRole('button', { name: 'Fehler' }).click();
  await page.getByLabel('Was ist passiert?').fill('Nach Spiel 2 stand der Zähler auf 0');
  await page.getByLabel('Was hast du gerade gemacht? (optional)').fill('Match mit zwei Handys');
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/screenshot.png'); // 1×1-PNG
  await expect(page.getByRole('img', { name: 'Ausgewählter Screenshot' })).toBeVisible();

  await page.getByRole('button', { name: 'Feedback senden' }).click();
  await expect(page.getByRole('heading', { name: 'Danke!' })).toBeVisible();

  expect(bodies).toHaveLength(1);
  const body = bodies[0];
  expect(body.category).toBe('bug');
  expect(body.message).toBe('Nach Spiel 2 stand der Zähler auf 0');
  expect(body.context).toBe('Match mit zwei Handys');
  expect(String(body.screenshot)).toMatch(/^data:image\/jpeg;base64,/);
  expect(body.app_version).toMatch(/^\d+\.\d+\.\d+/);
});

test('Fehler vom Server: Text bleibt stehen', async ({ page }) => {
  await page.route('**/api/v1/feedback', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/problem+json',
      body: JSON.stringify({ status: 429, detail: 'Du hast heute schon 10-mal Feedback geschickt. Danke!' }),
    }),
  );
  await page.goto('/feedback');
  await page.getByLabel('Was ist passiert?').fill('Noch ein Fehler');
  await page.getByRole('button', { name: 'Feedback senden' }).click();
  await expect(page.getByRole('alert')).toContainText('10-mal');
  await expect(page.getByLabel('Was ist passiert?')).toHaveValue('Noch ein Fehler');
});

test('Ohne Anmeldung kein Formular', async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{"status":401}' }),
  );
  await page.goto('/feedback');
  await expect(page.getByRole('heading', { name: 'Bitte anmelden' })).toBeVisible();
});

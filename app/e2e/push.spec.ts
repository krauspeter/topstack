import { type Route, expect, test } from '@playwright/test';

/** Benachrichtigungen im Profil (AP-8, TC-61) gegen eine nachgebaute API. */
test.use({ serviceWorkers: 'block' });

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const EVENTS: [string, string][] = [
  ['your_turn', 'Du bist dran'],
  ['new_round', 'Neue Runde'],
  ['tournament_end', 'Turnierende'],
  ['invitation', 'Einladung zu einem Turnier'],
  ['result_corrected', 'Ergebnis korrigiert'],
  ['cancel_requested', 'Abbruch beantragt'],
];

test('Ereignisse einzeln abschalten (TC-61)', async ({ page }) => {
  const prefs: Record<string, boolean> = Object.fromEntries(EVENTS.map(([e]) => [e, true]));
  const settings = () => ({
    devices: 1,
    events: EVENTS.map(([event, label]) => ({ event, label, enabled: prefs[event] })),
  });
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
  await page.route('**/api/v1/me/notifications', (route) => json(route, 200, settings()));
  const puts: unknown[] = [];
  await page.route('**/api/v1/me/notifications/*', async (route) => {
    const event = route.request().url().split('/').pop() ?? '';
    const body = route.request().postDataJSON() as { enabled: boolean };
    puts.push([event, body.enabled]);
    prefs[event] = body.enabled;
    return json(route, 200, settings());
  });

  await page.goto('/profil');
  const section = page.getByRole('region', { name: 'Benachrichtigungen' });
  await expect(section.getByRole('checkbox')).toHaveCount(6);
  const round = section.getByRole('checkbox', { name: 'Neue Runde' });
  await expect(round).toBeChecked();
  await round.uncheck();
  await expect(round).not.toBeChecked();
  expect(puts).toEqual([['new_round', false]]);
  await expect(section.getByRole('checkbox', { name: 'Du bist dran' })).toBeChecked();
});

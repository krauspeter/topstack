import { type Page, type Route, expect, test } from '@playwright/test';

/**
 * Konto-Seiten gegen eine nachgebaute API (page.route). Die echte API testet die
 * Server-CI; hier geht es um die Abläufe in der App (AP-3).
 */
test.use({ serviceWorkers: 'block' });

const ME = {
  id: '0193a000-0000-7000-8000-000000000001',
  email: 'anna@example.org',
  display_name: 'Anna',
  favorite_colors: 'U',
  locale: 'de',
  has_passkey: true,
  groups: [{ id: '0193a000-0000-7000-8000-0000000000aa', name: 'Draft-Runde', role: 'admin', player_id: '0193a000-0000-7000-8000-0000000000bb' }],
};

function json(route: Route, status: number, body?: unknown) {
  return route.fulfill({
    status,
    contentType: status >= 400 ? 'application/problem+json' : 'application/json',
    body: body === undefined ? '' : JSON.stringify(body),
  });
}

/** /me: angemeldet oder nicht; liefert eine Funktion zum Umschalten. */
async function mockMe(page: Page, initial: typeof ME | null) {
  let me = initial;
  await page.route('**/api/v1/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON() as Partial<typeof ME>;
      me = { ...(me ?? ME), ...patch };
      return json(route, 200, me);
    }
    return me ? json(route, 200, me) : json(route, 401, { status: 401, title: 'Nicht angemeldet', detail: 'Bitte melde dich an.' });
  });
  return (value: typeof ME | null) => {
    me = value;
  };
}

test('Magic-Link anfordern', async ({ page }) => {
  await mockMe(page, null);
  let body: unknown = null;
  await page.route('**/api/v1/auth/magic-link', async (route) => {
    body = route.request().postDataJSON();
    return json(route, 202, { status: 'accepted' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/anmelden$/);
  await page.getByLabel('E-Mail-Adresse').fill('anna@example.org');
  await page.getByRole('button', { name: 'Anmeldelink schicken' }).click();
  await expect(page.getByRole('status')).toContainText('Schau in dein Postfach');
  expect(body).toEqual({ email: 'anna@example.org' });
});

test('Link aus der Mail einlösen, danach angemeldet', async ({ page }) => {
  const setMe = await mockMe(page, null);
  let calls = 0;
  await page.route('**/api/v1/auth/magic-link/verify', async (route) => {
    calls += 1;
    expect(route.request().postDataJSON()).toEqual({ token: 'abc123abc123', invitation: null });
    setMe(ME);
    return json(route, 200, ME);
  });

  await page.goto('/anmelden?token=abc123abc123');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /Angemeldet als Anna/ })).toBeVisible();
  expect(calls).toBe(1); // einmaliger Link: nur ein Aufruf, auch im StrictMode
});

test('Abgelaufener Link zeigt Hinweis und neuen Link', async ({ page }) => {
  await mockMe(page, null);
  await page.route('**/api/v1/auth/magic-link/verify', (route) =>
    json(route, 410, { status: 410, title: 'Nicht mehr gültig', detail: 'Der Link ist abgelaufen oder wurde schon benutzt.' }),
  );

  await page.goto('/anmelden?token=altertoken12');
  await expect(page.getByRole('alert')).toContainText('abgelaufen');
  await page.getByRole('button', { name: 'Neuen Link anfordern' }).click();
  await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
});

test('Einladung ohne Konto: Link mit Einladung anfordern', async ({ page }) => {
  await mockMe(page, null);
  await page.route('**/api/v1/invitations/einladung123', (route) =>
    json(route, 200, { group_name: 'Draft-Runde', expires_at: '2026-11-26T20:00:00Z' }),
  );
  let body: unknown = null;
  await page.route('**/api/v1/auth/magic-link', async (route) => {
    body = route.request().postDataJSON();
    return json(route, 202, { status: 'accepted' });
  });

  await page.goto('/einladung/einladung123');
  await expect(page.getByRole('heading', { name: 'Einladung: Draft-Runde' })).toBeVisible();
  await page.getByLabel('E-Mail-Adresse').fill('ben@example.org');
  await page.getByRole('button', { name: 'Anmeldelink schicken' }).click();
  await expect(page.getByRole('status')).toContainText('Schau in dein Postfach');
  expect(body).toEqual({ email: 'ben@example.org', invitation: 'einladung123' });
});

test('Einladung mit Konto: Gruppe beitreten', async ({ page }) => {
  await mockMe(page, { ...ME, groups: [] });
  await page.route('**/api/v1/invitations/einladung123', (route) =>
    json(route, 200, { group_name: 'Draft-Runde', expires_at: '2026-11-26T20:00:00Z' }),
  );
  let accepted = false;
  await page.route('**/api/v1/invitations/einladung123/accept', async (route) => {
    accepted = true;
    return json(route, 200, { group_id: ME.groups[0].id, player_id: ME.groups[0].player_id, joined: true });
  });

  await page.goto('/einladung/einladung123');
  await page.getByRole('button', { name: 'Gruppe beitreten' }).click();
  await expect(page).toHaveURL(/\/profil$/);
  expect(accepted).toBe(true);
});

test('Ungültige Einladung', async ({ page }) => {
  await mockMe(page, null);
  await page.route('**/api/v1/invitations/weg', (route) =>
    json(route, 410, { status: 410, detail: 'Die Einladung ist abgelaufen oder ungültig.' }),
  );
  await page.goto('/einladung/weg');
  await expect(page.getByRole('alert')).toContainText('abgelaufen oder ungültig');
});

test('Profil: Mitglieder der Gruppe, Name und Lieblingsfarben speichern, Einladungslink erstellen', async ({ page }) => {
  await mockMe(page, ME);
  let patch: unknown = null;
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith('/api/v1/me')) patch = request.postDataJSON();
  });
  await page.route(`**/api/v1/groups/${ME.groups[0].id}/invitations`, (route) =>
    json(route, 201, {
      token: 'neu123',
      url: 'https://topstack.win/einladung/neu123',
      expires_at: '2026-11-26T20:00:00Z',
      max_uses: null,
    }),
  );

  await page.route(`**/api/v1/groups/${ME.groups[0].id}/players`, (route) =>
    json(route, 200, [
      { id: ME.groups[0].player_id, display_name: 'Anna', kind: 'member', is_me: true },
      { id: '0193a000-0000-7000-8000-0000000000cc', display_name: 'Ben', kind: 'member', is_me: false },
      { id: '0193a000-0000-7000-8000-0000000000dd', display_name: 'Chris', kind: 'reserved', is_me: false },
    ]),
  );

  await page.goto('/');
  await page.getByRole('button', { name: /Angemeldet als Anna/ }).click();
  await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();

  const members = page.getByRole('list', { name: 'Mitglieder von Draft-Runde' });
  await expect(members.getByRole('listitem')).toHaveText([/^Anna\s*du$/, 'Ben', /^Chris\s*ohne Konto$/]);
  await expect(page.getByText('3 Spieler, davon 1 ohne Konto')).toBeVisible();

  await page.getByLabel('Anzeigename').fill('Anni');
  await page.getByRole('group', { name: 'Lieblingsfarben' }).getByRole('button', { name: 'Rot' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('status')).toHaveText('Gespeichert.');
  expect(patch).toEqual({ display_name: 'Anni', favorite_colors: 'UR' });

  await page.getByRole('button', { name: 'Einladungslink erstellen' }).click();
  await expect(page.getByLabel('Einladungslink für Draft-Runde')).toHaveValue('https://topstack.win/einladung/neu123');
});

test('Abmelden', async ({ page }) => {
  await mockMe(page, ME);
  let loggedOut = false;
  await page.route('**/api/v1/auth/logout', (route) => {
    loggedOut = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/profil');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  expect(loggedOut).toBe(true);
});

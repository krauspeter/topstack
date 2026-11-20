import { type Page, type Route, expect, test } from '@playwright/test';

/** Turnier vorbereiten gegen eine nachgebaute API (AP-4). */
test.use({ serviceWorkers: 'block' });

const GROUP = '0193a000-0000-7000-8000-0000000000aa';
const TID = '0193a000-0000-7000-8000-0000000000t1';
const ME_PLAYER = 'p-peter';

const ME = {
  id: 'u1',
  email: 'peter@example.org',
  display_name: 'Peter',
  favorite_colors: '',
  locale: 'de',
  has_passkey: true,
  groups: [{ id: GROUP, name: 'Draft-Runde', role: 'admin', player_id: ME_PLAYER }],
};

type Entry = {
  player_id: string;
  display_name: string;
  kind: string;
  status: string;
  seat_no: number | null;
  colors: string | null;
  is_me: boolean;
};

function tournament(status: string, entries: Entry[], extra: Record<string, unknown> = {}) {
  const actions =
    status === 'setup' ? ['invite', 'respond', 'seat', 'cancel'] : status === 'seated' ? ['seat', 'start_draft', 'report_colors', 'cancel'] : ['cancel'];
  return {
    id: TID,
    group_id: GROUP,
    group_name: 'Draft-Runde',
    set_code: 'DSK',
    status,
    held_on: '2026-11-20',
    location: null,
    started_by: ME_PLAYER,
    seating: null,
    entries,
    my_player_id: ME_PLAYER,
    actions,
    ...extra,
  };
}

const entry = (id: string, name: string, kind = 'reserved', seat: number | null = null): Entry => ({
  player_id: id,
  display_name: name,
  kind,
  status: 'accepted',
  seat_no: seat,
  colors: null,
  is_me: id === ME_PLAYER,
});

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockBase(page: Page) {
  await page.route('**/api/v1/me', (route) => json(route, 200, ME));
}

test('Turnier starten', async ({ page }) => {
  await mockBase(page);
  let started: unknown = null;
  let current: unknown = null;
  await page.route(`**/api/v1/groups/${GROUP}/tournaments`, async (route) => {
    if (route.request().method() === 'POST') {
      started = route.request().postDataJSON();
      current = tournament('setup', [entry(ME_PLAYER, 'Peter', 'member')]);
      return json(route, 201, current);
    }
    return json(route, 200, []);
  });
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, current));

  await page.goto('/');
  await page.getByRole('button', { name: 'Turnier', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Turniere · Draft-Runde' })).toBeVisible();
  await page.getByLabel(/Set-Kürzel/).fill('dsk');
  await page.getByRole('button', { name: 'Draft-Turnier starten' }).click();
  await expect(page.getByRole('heading', { name: /Draft DSK/ })).toBeVisible();
  await expect(page.getByText('Anmeldung offen')).toBeVisible();
  expect(started).toEqual({ set_code: 'DSK' });
});

test('Spieler hinzufügen, Gäste-QR-Code, auslosen', async ({ page }) => {
  await mockBase(page);
  let state = tournament('setup', [entry(ME_PLAYER, 'Peter', 'member')]);
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  await page.route(`**/api/v1/groups/${GROUP}/players`, (route) =>
    json(route, 200, [
      { id: 'p-ben', display_name: 'Ben', kind: 'reserved', is_me: false },
      { id: 'p-chris', display_name: 'Chris', kind: 'reserved', is_me: false },
      { id: ME_PLAYER, display_name: 'Peter', kind: 'member', is_me: true },
    ]),
  );
  let invited: unknown = null;
  await page.route(`**/api/v1/tournaments/${TID}/entries`, async (route) => {
    invited = route.request().postDataJSON();
    state = tournament('setup', [entry('p-ben', 'Ben'), entry('p-chris', 'Chris'), entry(ME_PLAYER, 'Peter', 'member')]);
    return json(route, 200, state);
  });
  await page.route(`**/api/v1/tournaments/${TID}/guest-link`, (route) =>
    json(route, 201, { token: 'gasttoken', url: 'https://topstack.win/gast/gasttoken', expires_at: '2026-11-21T08:00:00Z' }),
  );
  await page.route(`**/api/v1/tournaments/${TID}/seating`, async (route) => {
    state = tournament(
      'seated',
      [entry('p-chris', 'Chris', 'reserved', 1), entry(ME_PLAYER, 'Peter', 'member', 2), entry('p-ben', 'Ben', 'reserved', 3)],
      { seating: { seed: 12345, draw: 1 } },
    );
    return json(route, 200, state);
  });

  await page.goto(`/turnier/${TID}`);
  await page.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  const group = page.getByRole('group', { name: 'Spieler der Gruppe' });
  await group.getByRole('button', { name: /Ben/ }).click();
  await group.getByRole('button', { name: /Chris/ }).click();
  await page.getByRole('button', { name: '2 hinzufügen' }).click();
  await expect(page.getByRole('list', { name: 'Teilnehmer' }).getByRole('listitem')).toHaveCount(3);
  expect(invited).toEqual({ player_ids: ['p-ben', 'p-chris'] });

  await page.getByRole('button', { name: 'Gäste-QR-Code zeigen' }).click();
  await expect(page.getByRole('img', { name: 'QR-Code für Gäste' })).toBeVisible();
  await expect(page.getByText('https://topstack.win/gast/gasttoken')).toBeVisible();

  await page.getByRole('button', { name: 'Plätze auslosen' }).click();
  await expect(page.getByTestId('tournament-seats')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('tournament-seats').getByRole('listitem')).toHaveText([
    'Chris gibt an Peter',
    'Peter gibt an Ben',
    'Ben gibt an Chris',
  ]);
  await expect(page.getByRole('button', { name: 'Draft beginnen' })).toBeVisible();
});

test('Farben melden, auch für Spieler ohne Konto', async ({ page }) => {
  await mockBase(page);
  let state = tournament('seated', [entry(ME_PLAYER, 'Peter', 'member', 1), entry('p-ben', 'Ben', 'reserved', 2)], {
    seating: { seed: 1, draw: 1 },
  });
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  const reported: Record<string, unknown> = {};
  await page.route(`**/api/v1/tournaments/${TID}/entries/*/colors`, async (route) => {
    const pid = route.request().url().split('/entries/')[1].split('/')[0];
    const body = route.request().postDataJSON() as { colors: string };
    reported[pid] = body;
    state = {
      ...state,
      entries: state.entries.map((e) => (e.player_id === pid ? { ...e, colors: body.colors } : e)),
    };
    return json(route, 200, state);
  });

  await page.goto(`/turnier/${TID}`);
  await page.getByRole('group', { name: 'Farben für Peter' }).getByRole('button', { name: 'Rot' }).click();
  await expect(page.getByRole('img', { name: 'Rot' })).toBeVisible();
  await page.getByRole('group', { name: 'Farben für Ben' }).getByRole('button', { name: 'Farblos' }).click();
  await expect(page.getByRole('list', { name: 'Farben' })).toContainText('Farblos');
  expect(reported).toEqual({ [ME_PLAYER]: { colors: 'R' }, 'p-ben': { colors: '' } });
});

test('Turnier abbrechen mit Bestätigung', async ({ page }) => {
  await mockBase(page);
  let state = tournament('setup', [entry(ME_PLAYER, 'Peter', 'member')]);
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  await page.route(`**/api/v1/tournaments/${TID}/cancel`, async (route) => {
    state = tournament('cancelled', state.entries);
    return json(route, 200, state);
  });
  await page.goto(`/turnier/${TID}`);
  await page.getByRole('button', { name: 'Turnier abbrechen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ja, abbrechen' }).click();
  await expect(page.getByText('Dieses Turnier wurde abgebrochen und zählt nicht.')).toBeVisible();
});

test('Gast meldet sich per QR-Code an', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => json(route, 401, { status: 401 }));
  await page.route('**/api/v1/guest/gasttoken', async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ display_name: 'Gina' });
      return json(route, 201, { tournament_id: TID, player_id: 'p-gina', display_name: 'Gina' });
    }
    return json(route, 200, { group_name: 'Draft-Runde', set_code: 'DSK', open: true });
  });
  await page.goto('/gast/gasttoken');
  await expect(page.getByRole('heading', { name: 'Draft DSK · Draft-Runde' })).toBeVisible();
  await page.getByLabel('Dein Name').fill('Gina');
  await page.getByRole('button', { name: 'Als Gast mitspielen' }).click();
  await expect(page.getByRole('status')).toContainText('Du bist dabei, Gina!');
});

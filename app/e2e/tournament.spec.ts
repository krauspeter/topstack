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
    status === 'setup' ? ['invite', 'respond', 'seat', 'cancel'] : status === 'seated' ? ['seat', 'start_draft', 'cancel'] : ['cancel'];
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
      current = { ...tournament('setup', [entry(ME_PLAYER, 'Peter', 'member')]), set_code: 'Mirrodin Besieged' };
      return json(route, 201, current);
    }
    return json(route, 200, []);
  });
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, current));

  await page.goto('/');
  await page.getByRole('button', { name: 'Turnier', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Turniere' })).toBeVisible();
  await page.getByLabel(/Name des Drafts/).fill('Mirrodin Besieged');
  await page.getByRole('button', { name: 'Draft-Turnier starten' }).click();
  await expect(page.getByRole('heading', { name: 'Mirrodin Besieged' })).toBeVisible();
  await expect(page.getByText('Anmeldung offen')).toBeVisible();
  expect(started).toEqual({ set_code: 'Mirrodin Besieged' });
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
  // Farben erst beim Deckbau, also nach Draftbeginn
  await expect(page.getByRole('list', { name: 'Farben' })).toHaveCount(0);
  await expect(page.getByText('Die Farben trägt jeder nach dem Draft beim Deckbau ein.')).toBeVisible();
});

test('Farben melden, auch für Spieler ohne Konto', async ({ page }) => {
  await mockBase(page);
  let state = {
    ...tournament('drafting', [entry(ME_PLAYER, 'Peter', 'member', 1), entry('p-ben', 'Ben', 'reserved', 2)], {
      seating: { seed: 1, draw: 1 },
    }),
    actions: ['report_colors', 'cancel'],
  };
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

test('Abgebrochenes Turnier löschen', async ({ page }) => {
  await mockBase(page);
  const state = { ...tournament('cancelled', [entry(ME_PLAYER, 'Peter', 'member')]), actions: ['delete'] };
  let deleted = false;
  await page.route(`**/api/v1/tournaments/${TID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      deleted = true;
      return route.fulfill({ status: 204 });
    }
    return json(route, 200, state);
  });
  await page.route(`**/api/v1/groups/${GROUP}/tournaments`, (route) => json(route, 200, []));
  await page.goto(`/turnier/${TID}`);
  await page.getByRole('button', { name: 'Turnier löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ja, löschen' }).click();
  await expect(page).toHaveURL(/\/turnier$/);
  expect(deleted).toBe(true);
});

test('Farbzeilen sehen gleich aus, egal wie viele Farben, und nichts ist breiter als der Bildschirm', async ({ page }) => {
  await mockBase(page);
  const long = 'Maximilian-Alexander';
  const state = tournament(
    'drafting',
    [
      { ...entry(ME_PLAYER, 'Peter', 'member', 1), colors: 'G' },
      { ...entry('p-max', long, 'reserved', 2), colors: 'BRG' },
      entry('p-sebastian', 'Sebastian', 'reserved', 3),
    ],
    { seating: { seed: 7, draw: 1 }, set_code: 'Mirrodin Besieged XL', actions: ['report_colors', 'cancel'] },
  );
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  await page.goto(`/turnier/${TID}`);
  const rows = page.getByRole('list', { name: 'Farben' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  const heights = await rows.evaluateAll((items) => items.map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1); // eine, drei oder keine Farbe: gleiche Höhe
  await expect(page.getByRole('heading', { name: 'Mirrodin Besieged XL' })).toBeVisible();
  // Kein Element ragt über den rechten Rand hinaus (sonst lässt sich die Seite seitlich schieben)
  const tooWide = await page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => el.tagName + '.' + el.className),
  );
  expect(tooWide).toEqual([]);
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

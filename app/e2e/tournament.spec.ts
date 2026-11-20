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
    rounds: [],
    current_round: null,
    open_in_current: 0,
    rounds_left: 0,
    standings: [],
    suggestion: null,
    cancel_vote: null,
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

// ---------------------------------------------------------------------------
// Turnier spielen (AP-5)
// ---------------------------------------------------------------------------

const PLAYERS = [
  { ...entry(ME_PLAYER, 'Peter', 'member', 1), colors: 'G' },
  entry('p-ben', 'Ben', 'reserved', 2),
  { ...entry('p-chris', 'Chris', 'reserved', 3), colors: 'UB' },
];

const match = (id: string, a: [string, string], b: [string, string], extra: Record<string, unknown> = {}) => ({
  id,
  player_a_id: a[0],
  player_a: a[1],
  player_b_id: b[0],
  player_b: b[1],
  status: 'scheduled',
  games_a: 0,
  games_b: 0,
  games_drawn: 0,
  version: 0,
  mine: a[0] === ME_PLAYER || b[0] === ME_PLAYER,
  can_report: true,
  ...extra,
});

const standing = (id: string, name: string, rank: number, extra: Record<string, unknown> = {}) => ({
  player_id: id,
  display_name: name,
  rank,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  match_points: 0,
  games_won: 0,
  games_lost: 0,
  game_diff: 0,
  needs_roll: false,
  roll: null,
  final_place: null,
  ranking_points: null,
  ...extra,
});

const PETER: [string, string] = [ME_PLAYER, 'Peter'];
const BEN: [string, string] = ['p-ben', 'Ben'];
const CHRIS: [string, string] = ['p-chris', 'Chris'];

function runningState(first: Record<string, unknown> = {}, standings = [standing(ME_PLAYER, 'Peter', 1), standing('p-ben', 'Ben', 1), standing('p-chris', 'Chris', 1)]) {
  return tournament('running', PLAYERS, {
    seating: { seed: 1, draw: 1 },
    actions: ['report_colors', 'next_round', 'report_result', 'pause', 'finish', 'cancel', 'request_cancel'],
    rounds: [
      { number: 1, status: 'running', bye: 'Chris', matches: [match('m1', PETER, BEN, first)] },
      { number: 2, status: 'planned', bye: 'Ben', matches: [match('m2', PETER, CHRIS)] },
      { number: 3, status: 'planned', bye: 'Peter', matches: [match('m3', BEN, CHRIS)] },
    ],
    current_round: 1,
    open_in_current: first.status === 'finished' ? 0 : 1,
    rounds_left: 2,
    standings,
  });
}

test('Runde 1 mit Warnung starten und Ergebnis eintragen', async ({ page }) => {
  await mockBase(page);
  let state: Record<string, unknown> = tournament('drafting', PLAYERS, {
    seating: { seed: 1, draw: 1 },
    actions: ['report_colors', 'start_round', 'cancel'],
  });
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  const starts: unknown[] = [];
  await page.route(`**/api/v1/tournaments/${TID}/rounds/next`, async (route) => {
    const body = route.request().postDataJSON() as { confirm: boolean };
    starts.push(body);
    if (!body.confirm) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Konflikt',
          status: 409,
          detail: 'Noch nicht alle haben ihre Farben eingetragen: Ben',
          code: 'missing_colors',
          names: ['Ben'],
        }),
      });
    }
    state = runningState();
    return json(route, 200, state);
  });
  let reported: unknown = null;
  await page.route(`**/api/v1/tournaments/${TID}/matches/m1/result`, async (route) => {
    reported = route.request().postDataJSON();
    state = runningState({ status: 'finished', games_a: 2, games_b: 1, version: 1 }, [
      standing(ME_PLAYER, 'Peter', 1, { played: 1, wins: 1, match_points: 3, games_won: 2, games_lost: 1 }),
      standing('p-chris', 'Chris', 2),
      standing('p-ben', 'Ben', 3, { played: 1, losses: 1, games_won: 1, games_lost: 2 }),
    ]);
    return json(route, 200, state);
  });

  await page.goto(`/turnier/${TID}`);
  await page.getByRole('button', { name: 'Runde 1 starten' }).click();
  const warning = page.getByRole('dialog', { name: 'Warnung' });
  await expect(warning).toContainText('Ben');
  await warning.getByRole('button', { name: 'Trotzdem starten' }).click();
  await expect(page.getByRole('heading', { name: 'Runde 1 von 3' })).toBeVisible();
  await expect(page.getByText('Pause: Chris')).toBeVisible();
  expect(starts).toEqual([{ confirm: false }, { confirm: true }]);

  await page.getByTestId('match').getByRole('button', { name: 'Ergebnis' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ergebnis eintragen' });
  await sheet.getByRole('button', { name: '2:1' }).click();
  await expect(sheet.getByTestId('verdict')).toHaveText('Peter gewinnt');
  await sheet.getByRole('button', { name: 'Ergebnis bestätigen' }).click();
  expect(reported).toEqual({ games_a: 2, games_b: 1, games_drawn: 0 });
  await expect(page.getByTestId('match').first()).toContainText('2:1');
  const table = page.getByRole('table', { name: 'Turniertabelle' });
  await expect(table.getByRole('row').nth(1)).toContainText('Peter');
  await expect(page.getByRole('button', { name: 'Runde 2 starten' })).toBeVisible();
});

test('Ergebnis korrigieren schickt die Version mit', async ({ page }) => {
  await mockBase(page);
  const state = runningState({ status: 'finished', games_a: 2, games_b: 0, version: 3 });
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  let body: unknown = null;
  await page.route(`**/api/v1/tournaments/${TID}/matches/m1/result`, async (route) => {
    body = route.request().postDataJSON();
    return json(route, 200, state);
  });
  await page.goto(`/turnier/${TID}`);
  await page.getByTestId('match').getByRole('button', { name: 'Ändern' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ergebnis eintragen' });
  await expect(sheet.getByRole('button', { name: 'Korrektur speichern' })).toBeDisabled();
  await sheet.getByRole('button', { name: '1:1' }).click();
  await expect(sheet.getByTestId('verdict')).toHaveText('Unentschieden');
  await sheet.getByRole('button', { name: 'Korrektur speichern' }).click();
  await expect.poll(() => body).toEqual({ games_a: 1, games_b: 1, games_drawn: 0, version: 3 });
});

test('Siegerehrung nach dem Abschluss', async ({ page }) => {
  await mockBase(page);
  const done = (id: string, name: string, place: number, points: number, rp: number) =>
    standing(id, name, place, { final_place: place, match_points: points, ranking_points: rp, played: 2 });
  const state = tournament('finished', PLAYERS, {
    actions: [],
    rounds: [{ number: 1, status: 'finished', bye: null, matches: [match('m1', PETER, BEN, { status: 'finished', games_a: 2 })] }],
    standings: [done(ME_PLAYER, 'Peter', 1, 6, 5), done('p-chris', 'Chris', 2, 3, 3), done('p-ben', 'Ben', 3, 0, 1)],
  });
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  await page.goto(`/turnier/${TID}`);
  const ceremony = page.getByTestId('ceremony');
  await expect(ceremony.getByRole('heading', { name: 'Siegerehrung' })).toBeVisible();
  await expect(ceremony.getByRole('listitem')).toHaveCount(3);
  await expect(ceremony.getByRole('listitem').first()).toContainText('Peter');
  await expect(page.getByRole('heading', { name: 'Endstand' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ergebnis' })).toHaveCount(0);
});

test('Abbruch per Abstimmung bestätigen', async ({ page }) => {
  await mockBase(page);
  let state: Record<string, unknown> = {
    ...runningState(),
    actions: ['report_result', 'next_round', 'pause', 'finish', 'vote_cancel'],
    cancel_vote: { requested_by: 'Anna', confirmed: 1, required: 3, participants: 4, i_voted: false, voters: ['p-anna'] },
  };
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  await page.route(`**/api/v1/tournaments/${TID}/cancel-request/vote`, async (route) => {
    expect(route.request().method()).toBe('PUT');
    state = { ...state, cancel_vote: { requested_by: 'Anna', confirmed: 2, required: 3, participants: 4, i_voted: true, voters: ['p-anna', ME_PLAYER] } };
    return json(route, 200, state);
  });
  await page.goto(`/turnier/${TID}`);
  const vote = page.getByTestId('cancel-vote');
  await expect(vote).toContainText('Anna möchte das Turnier abbrechen. 1 von 4 haben bestätigt, nötig sind 3.');
  await vote.getByRole('button', { name: 'Abbruch bestätigen' }).click();
  await expect(vote).toContainText('2 von 4');
  await expect(vote.getByRole('button', { name: 'Bestätigung zurücknehmen' })).toBeVisible();
});

test('Starter bestätigt den Abbruch für Spieler ohne Konto', async ({ page }) => {
  await mockBase(page);
  const vote = (voters: string[]) => ({ requested_by: 'Peter', confirmed: voters.length, required: 2, participants: 3, i_voted: true, voters });
  let state: Record<string, unknown> = { ...runningState(), cancel_vote: vote([ME_PLAYER]) };
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  const calls: string[] = [];
  await page.route(`**/api/v1/tournaments/${TID}/cancel-request/votes/*`, async (route) => {
    calls.push(`${route.request().method()} ${route.request().url().split('/votes/')[1]}`);
    state = { ...state, status: 'cancelled', cancel_vote: null, rounds: [], actions: ['delete'] };
    return json(route, 200, state);
  });
  await page.goto(`/turnier/${TID}`);
  const group = page.getByRole('group', { name: 'Bestätigen für' });
  await expect(group.getByRole('button')).toHaveText(['Ben', 'Chris']); // Peter stimmt selbst ab
  await group.getByRole('button', { name: 'Ben' }).click();
  await expect(page.getByText('Dieses Turnier wurde abgebrochen und zählt nicht.')).toBeVisible();
  expect(calls).toEqual(['PUT p-ben']);
});

import { type Page, type Route, expect, test } from '@playwright/test';

/** Life-Tracker für Turnier-Matches gegen eine nachgebaute API (AP-6, ADR-0012). */
test.use({ serviceWorkers: 'block' });

const GROUP = 'g-1';
const TID = 't-1';
const MID = 'm-1';
const PETER = 'p-peter';
const BEN = 'p-ben';

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

type ApiEvent = { id: string; type: string; player_id: string | null; delta?: number; game_id: string; [k: string]: unknown };

const entry = (id: string, name: string, kind: string, seat: number) => ({
  player_id: id,
  display_name: name,
  kind,
  status: 'accepted',
  seat_no: seat,
  colors: 'G',
  is_me: id === PETER,
});

const tournament = {
  id: TID,
  group_id: GROUP,
  group_name: 'Draft-Runde',
  set_code: 'DSK',
  status: 'running',
  held_on: '2026-11-20',
  location: null,
  started_by: PETER,
  seating: { seed: 1, draw: 1 },
  entries: [entry(PETER, 'Peter', 'member', 1), entry(BEN, 'Ben', 'reserved', 2)],
  my_player_id: PETER,
  actions: ['report_result', 'next_round', 'pause', 'finish', 'cancel'],
  rounds: [
    {
      number: 1,
      status: 'running',
      bye: null,
      matches: [
        {
          id: MID,
          player_a_id: PETER,
          player_b_id: BEN,
          player_a: 'Peter',
          player_b: 'Ben',
          status: 'scheduled',
          games_a: 0,
          games_b: 0,
          games_drawn: 0,
          version: 0,
          mine: true,
          can_report: true,
        },
      ],
    },
  ],
  current_round: 1,
  open_in_current: 1,
  rounds_left: 0,
  standings: [],
  suggestion: null,
  cancel_vote: null,
};

const matchInfo = (mode: string, status = 'running', a = 0, b = 0) => ({
  id: MID,
  status,
  tracker_mode: mode,
  games_a: a,
  games_b: b,
  games_drawn: 0,
  version: status === 'finished' ? 1 : 0,
});

function tracker(mode: string, events: ApiEvent[], status = 'running') {
  return {
    tournament_id: TID,
    match: matchInfo(mode, status),
    player_a: { id: PETER, display_name: 'Peter', colors: 'G', kind: 'member' },
    player_b: { id: BEN, display_name: 'Ben', colors: 'R', kind: 'reserved' },
    my_player_id: PETER,
    starting_life: 20,
    time_limit_min: null,
    events,
  };
}

/** Nachgebauter Server: speichert Ereignisse idempotent, zählt Spielsiege wie der echte. */
async function mockServer(page: Page, opts: { mode?: string; initial?: ApiEvent[] } = {}) {
  const server = { events: [...(opts.initial ?? [])], mode: opts.mode ?? 'shared', offline: false, batches: 0 };
  const status = () => {
    const ends = server.events.filter((e) => e.type === 'game_end');
    const a = ends.filter((e) => e.player_id === PETER).length;
    const b = ends.filter((e) => e.player_id === BEN).length;
    return matchInfo(server.mode, a >= 2 || b >= 2 ? 'finished' : 'running', a, b);
  };
  await page.route('**/api/v1/me', (route) =>
    json(route, 200, {
      id: 'u1',
      email: 'peter@example.org',
      display_name: 'Peter',
      favorite_colors: '',
      locale: 'de',
      has_passkey: true,
      groups: [{ id: GROUP, name: 'Draft-Runde', role: 'admin', player_id: PETER }],
    }),
  );
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, tournament));
  await page.route(`**/api/v1/tournaments/${TID}/matches/${MID}/tracker`, async (route) => {
    if (server.offline) return route.abort('internetdisconnected');
    if (route.request().method() === 'POST') {
      server.mode = (route.request().postDataJSON() as { mode: string }).mode;
    }
    return json(route, 200, { ...tracker(server.mode, server.events), match: status() });
  });
  await page.route(`**/api/v1/tournaments/${TID}/matches/${MID}/events`, async (route) => {
    if (server.offline) return route.abort('internetdisconnected');
    server.batches += 1;
    const { events } = route.request().postDataJSON() as { events: ApiEvent[] };
    const known = new Set(server.events.map((e) => e.id));
    const fresh = events.filter((e) => !known.has(e.id));
    server.events.push(...fresh);
    return json(route, 200, {
      accepted: fresh.map((e) => e.id),
      duplicates: events.filter((e) => known.has(e.id)).map((e) => e.id),
      rejected: [],
      match: status(),
    });
  });
  return server;
}

async function rollAndStart(page: Page) {
  const peter = page.getByRole('button', { name: 'Peter würfelt' });
  const ben = page.getByRole('button', { name: 'Ben würfelt' });
  const start = page.getByRole('button', { name: 'Ich beginne' });
  await expect(async () => {
    if (await peter.isEnabled()) await peter.click();
    if (await ben.isEnabled()) await ben.click();
    await expect(start).toBeEnabled({ timeout: 2500 });
  }).toPass({ timeout: 30_000 });
  await start.click();
}

const lifeOf = (server: { events: ApiEvent[] }, player: string) =>
  server.events.filter((e) => e.type === 'life' && e.player_id === player).reduce((sum, e) => sum + (e.delta ?? 0), 0);

test('Turnier-Match mit einem Handy: Ereignisse und Ergebnis landen auf dem Server', async ({ page }) => {
  const server = await mockServer(page);
  await page.goto(`/turnier/${TID}`);
  await page.getByTestId('match').getByRole('button', { name: 'Spielen' }).click();
  await page.getByRole('dialog', { name: 'Match spielen' }).getByRole('button', { name: 'Ein Handy für beide' }).click();
  await expect(page).toHaveURL(/\/$/);
  await rollAndStart(page);

  await page.getByRole('button', { name: 'Ben −1' }).click();
  await page.getByRole('button', { name: 'Ben −1' }).click();
  await expect(page.getByTestId(`life-${BEN}`)).toHaveText('18');
  await expect.poll(() => lifeOf(server, BEN)).toBe(-2);
  await expect(page.getByTestId('sync')).toHaveText('gespeichert');
  expect(server.events.filter((e) => e.type === 'die_roll').length).toBeGreaterThanOrEqual(2);

  const concede = async () => {
    await page.getByRole('button', { name: 'Menü' }).click();
    await page.getByRole('button', { name: 'Ben gibt auf' }).click();
    await page.getByRole('button', { name: 'Ja, Spiel beenden' }).click();
  };
  await concede();
  await page.getByRole('button', { name: 'Ich beginne' }).click();
  await concede();

  await expect(page.getByTestId('match-winner')).toHaveText('Peter gewinnt');
  await expect(page.getByTestId('result-saved')).toBeVisible({ timeout: 10_000 });
  const ends = server.events.filter((e) => e.type === 'game_end');
  expect(ends.map((e) => [e.player_id, e.reason])).toEqual([
    [PETER, 'concede'],
    [PETER, 'concede'],
  ]);
  await page.getByRole('button', { name: 'Zurück zum Turnier' }).click();
  await expect(page).toHaveURL(new RegExp(`/turnier/${TID}$`));
});

test('Offline weiterzählen, danach kommt alles an (N-01)', async ({ page }) => {
  const server = await mockServer(page);
  await page.goto(`/turnier/${TID}`);
  await page.getByTestId('match').getByRole('button', { name: 'Spielen' }).click();
  await page.getByRole('button', { name: 'Ein Handy für beide' }).click();
  await rollAndStart(page);
  await expect(page.getByTestId('sync')).toHaveText('gespeichert');

  server.offline = true;
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Peter −1' }).click();
  await expect(page.getByTestId(`life-${PETER}`)).toHaveText('15');
  await expect(page.getByTestId('sync')).toHaveText('offline · zählt weiter');

  // Neuladen ohne Netz: Stand und Outbox bleiben auf dem Handy
  await page.reload();
  await expect(page.getByTestId(`life-${PETER}`)).toHaveText('15');

  server.offline = false;
  await expect.poll(() => lifeOf(server, PETER), { timeout: 10_000 }).toBe(-5);
  await expect(page.getByTestId('sync')).toHaveText('gespeichert');
  expect(new Set(server.events.map((e) => e.id)).size).toBe(server.events.length);
});

test('Zweites Handy koppeln: zählt nur den eigenen Spieler und sieht den Gegner (UC-11)', async ({ page }) => {
  const game = 'game-1';
  const other = (id: string, type: string, player: string | null, seq: number, extra = {}) => ({
    id,
    game_id: game,
    type,
    player_id: player,
    device_id: 'handy-ben',
    seq,
    client_ts: `2026-11-20T19:00:0${seq}Z`,
    source: 'app',
    ...extra,
  });
  const server = await mockServer(page, { mode: 'dual', initial: [other('e1', 'game_start', BEN, 1)] });
  await page.goto(`/turnier/${TID}`);
  await page.getByTestId('match').getByRole('button', { name: 'Spielen' }).click();
  // Spiel läuft schon: kein Modus wählen, Peter zählt automatisch sich selbst
  await expect(page.getByTestId('score')).toContainText('Spiel 1');
  await expect(page.getByRole('button', { name: 'Ben −1' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Peter −1' }).click();
  await expect.poll(() => lifeOf(server, PETER)).toBe(-1);

  // Ben zählt auf seinem Handy, dieses Handy holt es sich vom Server
  server.events.push(other('e2', 'life', BEN, 2, { delta: -3 }));
  await expect(page.getByTestId(`life-${BEN}`)).toHaveText('17', { timeout: 6000 });
  await page.getByRole('button', { name: 'Menü' }).click();
  await expect(page.getByRole('button', { name: 'Peter gibt auf' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ben gibt auf' })).toHaveCount(0);
});

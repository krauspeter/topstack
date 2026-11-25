import { type Route, type WebSocketRoute, expect, test } from '@playwright/test';

/** Startseite mit Turnier-Karte (Vorschlag A, Phase 4): Zustand, Gold, Live-Aktualisierung. */
test.use({ serviceWorkers: 'block' });

const GROUP = 'g-1';
const TID = 't-1';
const ME = 'p-anna';

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const match = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'm2',
  player_a_id: 'p-ben',
  player_a: 'Ben',
  player_b_id: ME,
  player_b: 'Anna',
  status,
  games_a: 0,
  games_b: 0,
  games_drawn: 0,
  version: 0,
  mine: true,
  can_report: true,
  tracker_mode: 'none',
  game_no: null,
  life_a: null,
  life_b: null,
  ...extra,
});

const tournament = (m: Record<string, unknown>) => ({
  id: TID,
  group_id: GROUP,
  group_name: 'Draft-Runde',
  set_code: 'DSK',
  status: 'running',
  held_on: '2026-12-28',
  location: null,
  started_by: ME,
  seating: null,
  entries: [
    { player_id: ME, display_name: 'Anna', kind: 'member', status: 'accepted', seat_no: 1, colors: 'UR', is_me: true },
    { player_id: 'p-ben', display_name: 'Ben', kind: 'member', status: 'accepted', seat_no: 2, colors: 'G', is_me: false },
  ],
  my_player_id: ME,
  actions: ['report_result'],
  rounds: [
    { number: 1, status: 'finished', bye: null, matches: [] },
    { number: 2, status: 'running', bye: null, matches: [m] },
  ],
  current_round: 2,
  open_in_current: 1,
  rounds_left: 1,
  standings: [
    {
      player_id: ME,
      display_name: 'Anna',
      rank: 2,
      played: 1,
      wins: 1,
      draws: 0,
      losses: 0,
      match_points: 3,
      games_won: 2,
      games_lost: 1,
      game_diff: 1,
      needs_roll: false,
      roll: null,
      final_place: null,
      ranking_points: null,
    },
  ],
  suggestion: null,
  cancel_vote: null,
  next_opponent: null,
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'anna@example.org',
      display_name: 'Anna',
      favorite_colors: '',
      locale: 'de',
      has_passkey: true,
      groups: [{ id: GROUP, name: 'Draft-Runde', role: 'admin', player_id: ME }],
    }),
  );
});

test('Laufendes Turnier: Karte mit nächstem Schritt in Gold, live aktualisiert', async ({ page }) => {
  let state = tournament(match('scheduled'));
  await page.route(`**/api/v1/groups/${GROUP}/tournaments`, (route) =>
    json(route, [{ id: TID, set_code: 'DSK', status: 'running', held_on: '2026-12-28', players: 2 }]),
  );
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, state));
  const conn: { ws?: WebSocketRoute } = {};
  await page.routeWebSocket('**/ws', (ws) => {
    conn.ws = ws;
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as { type: string; topic: string };
      if (msg.type === 'subscribe') ws.send(JSON.stringify({ type: 'subscribed', topic: msg.topic }));
    });
  });

  await page.goto('/');
  const card = page.getByRole('region', { name: 'Turnier DSK' });
  await expect(card).toContainText('TURNIER LÄUFT · DSK · RUNDE 2 VON 2');
  await expect(card.getByRole('heading', { name: 'Du bist dran' })).toBeVisible();
  await expect(card).toContainText('Dein Match gegen Ben kann starten.');
  await expect(card).toContainText('2.');
  await expect(card).toContainText('1-0-0');

  // Gold gehört dem nächsten Schritt, „Freies Match“ ist dann grau
  await expect(card.getByRole('button', { name: 'Match starten' })).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: 'Freies Match' })).not.toHaveClass(/primary/);

  // Gegner startet das Match auf seinem Handy: Karte zeigt Lebenspunkte aus meiner Sicht
  state = tournament(match('running', { game_no: 1, life_a: 15, life_b: 9, tracker_mode: 'dual' }));
  await expect.poll(() => conn.ws !== undefined).toBe(true);
  conn.ws?.send(JSON.stringify({ type: 'tournament.updated', topic: `tournament:${TID}`, tournament_id: TID, reason: 'match' }));
  await expect(card.getByRole('heading', { name: 'Gegen Ben' })).toBeVisible();
  await expect(card.getByLabel('Lebenspunkte 9 zu 15')).toBeVisible();

  await card.getByRole('button', { name: 'Zum Match' }).click();
  await expect(page).toHaveURL(new RegExp(`/turnier/${TID}$`));
});

test('Ohne laufendes Turnier: Startseite wie bisher, „Freies Match“ in Gold', async ({ page }) => {
  await page.route(`**/api/v1/groups/${GROUP}/tournaments`, (route) =>
    json(route, [
      { id: 't-old', set_code: 'MKM', status: 'finished', held_on: '2026-11-01', players: 6, finished_at: '2026-11-01T23:10:00Z' },
    ]),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Freies Match' })).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: 'Turnier', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: /Turnier / })).toHaveCount(0);
});

test('Pause: Match vorziehen von der Startseite, mit Rückfrage; Rahmen gold, „Freies Match“ grau', async ({ page }) => {
  const t = tournament({
    ...match('running', { life_a: 20, life_b: 11 }),
    id: 'm5',
    player_a_id: 'p-ben',
    player_a: 'Ben',
    player_b_id: 'p-dana',
    player_b: 'Dana',
    mine: false,
  });
  t.rounds.push({
    number: 3,
    status: 'planned',
    bye: null,
    matches: [{ ...match('scheduled'), id: 'm7', player_a_id: 'p-chris', player_a: 'Chris' }],
  });
  await page.route(`**/api/v1/groups/${GROUP}/tournaments`, (route) =>
    json(route, [{ id: TID, set_code: 'DSK', status: 'running', held_on: '2026-12-28', players: 4 }]),
  );
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, t));
  let pulled = false;
  await page.route(`**/api/v1/tournaments/${TID}/matches/m7/start`, (route) => {
    pulled = true;
    return json(route, t);
  });

  await page.goto('/');
  const card = page.getByRole('region', { name: 'Turnier DSK' });
  await expect(card.getByRole('heading', { name: 'Du hast gerade frei' })).toBeVisible();
  await expect(card).toHaveClass(/hot/);
  await expect(page.getByRole('button', { name: 'Freies Match' })).not.toHaveClass(/primary/);
  await expect(card.getByRole('list', { name: 'Laufende Matches' })).toContainText('Ben20 : 11Dana');

  await card.getByRole('button', { name: 'Match vorziehen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bestätigen' });
  await expect(dialog).toContainText('Match gegen Chris aus Runde 3 jetzt vorziehen?');
  await dialog.getByRole('button', { name: 'Vorziehen' }).click();
  await expect(page).toHaveURL(new RegExp(`/turnier/${TID}$`));
  expect(pulled).toBe(true);
});

test('Server nicht erreichbar: Hinweis statt verschwundener Knöpfe, „Erneut versuchen“ holt die Anmeldung', async ({ page }) => {
  let down = true;
  await page.route('**/api/v1/me', (route) =>
    down
      ? route.abort('connectionrefused')
      : route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{"title":"Nicht angemeldet"}' }),
  );
  await page.route('**/api/v1/health', (route) => route.abort('connectionrefused'));

  await page.goto('/');
  const note = page.getByRole('status');
  await expect(note).toContainText('Server gerade nicht erreichbar');
  await expect(page.getByRole('button', { name: 'Freies Match' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toHaveCount(0);

  down = false;
  await note.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('Cloudflare-Anmeldung abgelaufen (Staging): Hinweis und neu anmelden über /api/v1/return', async ({ page, browserName }) => {
  // Playwright kann in WebKit keine Umleitung (302) nachstellen; geprüft wird in Chromium
  test.skip(browserName === 'webkit', 'route.fulfill mit 302 geht in WebKit nicht');
  const access = 'https://topstack.cloudflareaccess.com/cdn-cgi/access/login/beta.topstack.win';
  for (const path of ['**/api/v1/me', '**/api/v1/health']) {
    await page.route(path, (route) => route.fulfill({ status: 302, headers: { location: access } }));
  }
  await page.route(`${access}*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Access</p>' }));
  let returned = false;
  await page.route('**/api/v1/return', (route) => {
    returned = true;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>zurück</p>' });
  });

  await page.goto('/');
  const note = page.getByRole('status');
  await expect(note).toContainText('Anmeldung bei Cloudflare abgelaufen');
  await note.getByRole('button', { name: 'Seite neu laden' }).click();
  await expect.poll(() => returned).toBe(true);
});

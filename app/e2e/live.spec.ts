import { type Route, type WebSocketRoute, expect, test } from '@playwright/test';

/** Live-Ansicht über einen nachgebauten WebSocket (AP-7, N-04). */
test.use({ serviceWorkers: 'block' });

const GROUP = 'g-1';
const TID = 't-1';
const PETER = 'p-peter';

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

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
  mine: a[0] === PETER || b[0] === PETER,
  can_report: true,
  tracker_mode: 'none',
  game_no: null,
  life_a: null,
  life_b: null,
  ...extra,
});

const entry = (id: string, name: string, seat: number) => ({
  player_id: id,
  display_name: name,
  kind: id === PETER ? 'member' : 'reserved',
  status: 'accepted',
  seat_no: seat,
  colors: 'G',
  is_me: id === PETER,
});

function tournament(first: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: TID,
    group_id: GROUP,
    group_name: 'Draft-Runde',
    set_code: 'DSK',
    status: 'running',
    held_on: '2026-11-21',
    location: null,
    started_by: PETER,
    seating: { seed: 1, draw: 1 },
    entries: [entry(PETER, 'Peter', 1), entry('p-ben', 'Ben', 2), entry('p-chris', 'Chris', 3)],
    my_player_id: PETER,
    actions: ['report_result', 'next_round', 'pause', 'finish', 'cancel'],
    rounds: [
      { number: 1, status: 'running', bye: 'Peter', matches: [match('m1', ['p-ben', 'Ben'], ['p-chris', 'Chris'], first)] },
      { number: 2, status: 'planned', bye: 'Ben', matches: [match('m2', [PETER, 'Peter'], ['p-chris', 'Chris'])] },
    ],
    current_round: 1,
    open_in_current: 1,
    rounds_left: 1,
    standings: [],
    suggestion: null,
    cancel_vote: null,
    next_opponent: null,
    ...extra,
  };
}

test('Lebenspunkte erscheinen über den WebSocket in unter 2 Sekunden (TC-50)', async ({ page }) => {
  let state = tournament({ status: 'running', tracker_mode: 'shared', game_no: 1, life_a: 20, life_b: 20 });
  let gets = 0;
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
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => {
    gets += 1;
    return json(route, 200, state);
  });

  const subscribed: string[] = [];
  const received: string[] = [];
  const conn: { ws?: WebSocketRoute } = {};
  await page.routeWebSocket('**/ws', (ws) => {
    conn.ws = ws;
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as { type: string; topic: string };
      received.push(msg.type);
      if (msg.type === 'subscribe') {
        subscribed.push(msg.topic);
        ws.send(JSON.stringify({ type: 'subscribed', topic: msg.topic }));
      }
    });
  });

  await page.goto(`/turnier/${TID}`);
  await expect(page.getByTestId('live-life')).toContainText('20 : 20');
  await expect.poll(() => subscribed).toContain(`tournament:${TID}`);

  // Ben verliert 6 Leben auf einem anderen Handy
  state = tournament({ status: 'running', tracker_mode: 'shared', game_no: 1, life_a: 14, life_b: 20 });
  const before = gets;
  const sent = Date.now();
  conn.ws?.send(
    JSON.stringify({ type: 'game.events', topic: `tournament:${TID}`, match_id: 'm1', events: [{ id: 'e1' }] }),
  );
  await expect(page.getByTestId('live-life')).toContainText('14 : 20', { timeout: 2000 });
  expect(Date.now() - sent).toBeLessThan(2000);
  expect(gets).toBe(before + 1);

  // Ping beantwortet die App mit Pong
  conn.ws?.send(JSON.stringify({ type: 'ping' }));
  await expect.poll(() => received).toContain('pong');
});

test('Pause-Ansicht zeigt den nächsten Gegner und die Bilanz (TC-52)', async ({ page }) => {
  const state = tournament(
    { status: 'running', tracker_mode: 'dual', game_no: 2, life_a: 7, life_b: 12, games_a: 1 },
    { next_opponent: { player_id: 'p-chris', display_name: 'Chris', round: 2, wins: 2, draws: 1, losses: 0 } },
  );
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
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, 200, state));
  await page.routeWebSocket('**/ws', () => undefined);
  await page.goto(`/turnier/${TID}`);
  const card = page.getByTestId('pause-card');
  await expect(card).toContainText('Du hast gerade frei');
  await expect(card).toContainText('Nächster Gegner: Chris (Runde 2)');
  await expect(card).toContainText('Deine Bilanz gegen Chris: 2 Siege, 1 Unentschieden, 0 Niederlagen.');
  await expect(page.getByTestId('live-life')).toContainText('7 : 12');
  await expect(page.getByTestId('live-life')).toContainText('Spiel 2 · 1:0');
});

import { type Page, type Route, expect, test } from '@playwright/test';

/**
 * Screenshots fürs README (Phase 4, AP-6). Läuft nur mit SCREENSHOTS=1, nicht in der normalen CI:
 *   SCREENSHOTS=1 npx playwright test screenshots --project=android
 * oder auf GitHub: Actions → „Screenshots“ → Run workflow. Die Bilder landen in docs/img/.
 * Alle Daten sind erfunden; die API wird nachgebaut, damit kein Server nötig ist.
 */
// Node-Typen sind im App-Projekt nicht eingebunden, process gibt es zur Laufzeit trotzdem
declare const process: { env: Record<string, string | undefined> };
test.skip(!process.env.SCREENSHOTS, 'nur mit SCREENSHOTS=1');
test.use({ serviceWorkers: 'block' });

const OUT = '../docs/img';
const GROUP = 'g-1';
const TID = 't-1';
const ME = 'p-anna';

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function signedIn(page: Page) {
  await page.route('**/api/v1/health', (route) =>
    json(route, { status: 'ok', version: '1.0.0', environment: 'prod', build: { pr: '', sha: '', time: '' } }),
  );
  await page.route('**/api/v1/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'anna@example.org',
      display_name: 'Anna',
      favorite_colors: 'UR',
      locale: 'de',
      has_passkey: true,
      groups: [{ id: GROUP, name: 'Draft-Runde', role: 'admin', player_id: ME }],
    }),
  );
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(400); // Animationen auslaufen lassen
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('Life-Tracker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neues Match' }).click();
  await page.getByLabel('Spieler 1', { exact: true }).fill('Anna');
  await page.getByLabel('Spieler 2', { exact: true }).fill('Ben');
  const colors = (i: number) => page.getByRole('group', { name: `Farben für Spieler ${i}` });
  await colors(1).getByRole('button', { name: 'Rot', exact: true }).click(); // Blau (voreingestellt) plus Rot
  await colors(2).getByRole('button', { name: 'Rot', exact: true }).click(); // Rot (voreingestellt) abwählen
  await colors(2).getByRole('button', { name: 'Grün', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter zum W20-Wurf' }).click();
  const anna = page.getByRole('button', { name: 'Anna würfelt' });
  const ben = page.getByRole('button', { name: 'Ben würfelt' });
  const start = page.getByRole('button', { name: 'Ich beginne' });
  await expect(async () => {
    if (await anna.isEnabled()) await anna.click();
    if (await ben.isEnabled()) await ben.click();
    await expect(start).toBeEnabled({ timeout: 2500 });
  }).toPass({ timeout: 30_000 });
  await start.click();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Ben −1' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Anna −1' }).click();
  await expect(page.getByTestId('life-p2')).toHaveText('13');
  await shoot(page, 'life-tracker');
});

test('Tischgrafik', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Draftplätze auslosen' }).click();
  for (const name of ['Anna', 'Ben', 'Chris', 'Dana', 'Eli', 'Finn']) {
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Name').press('Enter');
  }
  await page.getByRole('button', { name: 'Plätze auslosen' }).click();
  await expect(page.getByTestId('seats').locator('li')).toHaveCount(6, { timeout: 5000 });
  await expect(page.getByRole('button', { name: /Booster 1, nach links/ })).toBeVisible();
  await shoot(page, 'tischgrafik');
});

test('Live-Ansicht', async ({ page }) => {
  await signedIn(page);
  const players: [string, string, string][] = [
    [ME, 'Anna', 'UR'],
    ['p-ben', 'Ben', 'G'],
    ['p-chris', 'Chris', 'WB'],
    ['p-dana', 'Dana', 'BR'],
    ['p-eli', 'Eli', 'WU'],
  ];
  const name = (id: string) => players.find((p) => p[0] === id)?.[1] ?? '';
  const match = (id: string, a: string, b: string, extra: Record<string, unknown> = {}) => ({
    id,
    player_a_id: a,
    player_a: name(a),
    player_b_id: b,
    player_b: name(b),
    status: 'scheduled',
    games_a: 0,
    games_b: 0,
    games_drawn: 0,
    version: 0,
    mine: a === ME || b === ME,
    can_report: true,
    tracker_mode: 'none',
    game_no: null,
    life_a: null,
    life_b: null,
    ...extra,
  });
  const done = (id: string, a: string, b: string, ga: number, gb: number) =>
    match(id, a, b, { status: 'finished', games_a: ga, games_b: gb });
  const standing = (id: string, rank: number, w: number, l: number, gw: number, gl: number) => ({
    player_id: id,
    display_name: name(id),
    rank,
    played: w + l,
    wins: w,
    draws: 0,
    losses: l,
    match_points: 3 * w,
    games_won: gw,
    games_lost: gl,
    game_diff: gw - gl,
    needs_roll: false,
    roll: null,
    final_place: null,
    ranking_points: null,
  });
  const tournament = {
    id: TID,
    group_id: GROUP,
    group_name: 'Draft-Runde',
    set_code: 'DSK',
    status: 'running',
    held_on: '2026-12-28',
    location: null,
    started_by: ME,
    seating: { seed: 1, draw: 1 },
    entries: players.map(([id, n, colors], i) => ({
      player_id: id,
      display_name: n,
      kind: 'member',
      status: 'accepted',
      seat_no: i + 1,
      colors,
      is_me: id === ME,
    })),
    my_player_id: ME,
    actions: ['report_result', 'next_round', 'pause', 'finish', 'cancel'],
    rounds: [
      { number: 1, status: 'finished', bye: 'Eli', matches: [done('m1', ME, 'p-ben', 2, 1), done('m2', 'p-chris', 'p-dana', 0, 2)] },
      {
        number: 2,
        status: 'running',
        bye: 'Chris',
        matches: [
          match('m3', ME, 'p-dana', { status: 'running', tracker_mode: 'dual', game_no: 2, life_a: 8, life_b: 14, games_a: 1 }),
          match('m4', 'p-ben', 'p-eli', { status: 'running', tracker_mode: 'shared', game_no: 1, life_a: 20, life_b: 11 }),
        ],
      },
      { number: 3, status: 'planned', bye: 'Dana', matches: [match('m5', ME, 'p-eli'), match('m6', 'p-ben', 'p-chris')] },
    ],
    current_round: 2,
    open_in_current: 2,
    rounds_left: 3,
    standings: [
      standing('p-dana', 1, 1, 0, 2, 0),
      standing(ME, 2, 1, 0, 2, 1),
      standing('p-ben', 3, 0, 1, 1, 2),
      standing('p-chris', 4, 0, 1, 0, 2),
      standing('p-eli', 5, 0, 0, 0, 0),
    ],
    suggestion: null,
    cancel_vote: null,
    next_opponent: null,
  };
  await page.route(`**/api/v1/tournaments/${TID}`, (route) => json(route, tournament));
  await page.routeWebSocket('**/ws', () => undefined);
  await page.goto(`/turnier/${TID}`);
  await expect(page.getByTestId('live-life').first()).toBeVisible();
  await shoot(page, 'live-ansicht');
});

test('Rangliste', async ({ page }) => {
  await signedIn(page);
  const row = (rank: number, id: string, n: string, points: number, mp: number, t: number, wins: number) => ({
    rank,
    player_id: id,
    display_name: n,
    kind: 'member',
    tournaments: t,
    wins,
    ranking_points: points,
    match_points: mp,
    avg_match_points: mp / t,
  });
  await page.route(`**/api/v1/groups/${GROUP}/seasons`, (route) =>
    json(route, [{ id: 's-2027', name: '2027', starts_on: '2027-01-01', ends_on: null, current: true }]),
  );
  await page.route(`**/api/v1/groups/${GROUP}/leaderboard**`, (route) =>
    json(route, {
      tournaments: 6,
      rows: [
        row(1, 'p-dana', 'Dana', 38, 41, 6, 2),
        row(2, ME, 'Anna', 35, 39, 6, 2),
        row(3, 'p-ben', 'Ben', 29, 30, 6, 1),
        row(4, 'p-chris', 'Chris', 24, 27, 6, 1),
        row(5, 'p-eli', 'Eli', 19, 18, 5, 0),
        row(6, 'p-finn', 'Finn', 11, 12, 4, 0),
      ],
    }),
  );
  await page.goto('/rangliste');
  await expect(page.getByText('Dana').first()).toBeVisible();
  await shoot(page, 'rangliste');
});

import { type Route, expect, test } from '@playwright/test';

/** Rangliste und Spielerstatistik gegen eine nachgebaute API (AP-9). */
test.use({ serviceWorkers: 'block' });

const GROUP = 'g-1';
const PETER = 'p-peter';

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const row = (rank: number, id: string, name: string, points: number, mp: number, t = 2, wins = 0) => ({
  rank,
  player_id: id,
  display_name: name,
  kind: id === PETER ? 'member' : 'reserved',
  tournaments: t,
  wins,
  ranking_points: points,
  match_points: mp,
  avg_match_points: mp / t,
});

test('Rangliste mit Saisonfilter, Zeitraum und Spielerstatistik', async ({ page }) => {
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
  await page.route(`**/api/v1/groups/${GROUP}/seasons`, (route) =>
    json(route, 200, [{ id: 's-2027', name: '2027', starts_on: '2027-01-01', ends_on: null, current: true }]),
  );
  const queries: string[] = [];
  await page.route(`**/api/v1/groups/${GROUP}/leaderboard**`, (route) => {
    const q = new URL(route.request().url()).search;
    queries.push(q);
    const season = q.includes('season=s-2027');
    return json(route, 200, {
      tournaments: season ? 1 : 2,
      rows: season
        ? [row(1, PETER, 'Peter', 7, 12, 1, 1), row(2, 'p-ben', 'Ben', 5, 9, 1)]
        : [row(1, PETER, 'Peter', 8, 12, 2, 1), row(1, 'p-chris', 'Chris', 8, 12, 2, 1), row(3, 'p-ben', 'Ben', 8, 12)],
    });
  });
  await page.route(`**/api/v1/groups/${GROUP}/players/p-chris/stats**`, (route) =>
    json(route, 200, {
      player_id: 'p-chris',
      display_name: 'Chris',
      tournaments: 2,
      tournament_wins: 1,
      ranking_points: 8,
      places: { '1': 1, '3': 1 },
      avg_place: 2,
      matches: { wins: 3, draws: 0, losses: 3 },
      match_win_rate: 50,
      games_won: 7,
      games_lost: 6,
      games_drawn: 0,
      game_win_rate: 53.8,
      colors: [{ key: 'G', count: 2 }],
      combos: [{ key: 'G', count: 1 }, { key: 'BG', count: 1 }],
      opponents: [
        { player_id: PETER, display_name: 'Peter', wins: 1, draws: 0, losses: 1 },
        { player_id: 'p-ben', display_name: 'Ben', wins: 1, draws: 0, losses: 1 },
        { player_id: 'p-sebastian', display_name: 'Sebastian', wins: 0, draws: 0, losses: 1 },
      ],
      with_colors: [
        { key: 'G', wins: 2, draws: 0, losses: 0, win_rate: 100 },
        { key: 'BG', wins: 1, draws: 0, losses: 3, win_rate: 25 },
      ],
      vs_colors: [
        { key: 'R', wins: 0, draws: 0, losses: 2, win_rate: 0 },
        { key: 'C', wins: 1, draws: 0, losses: 1, win_rate: 50 },
      ],
    }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Rangliste' }).click();
  await expect(page).toHaveURL(/\/rangliste$/);
  const table = page.getByRole('table', { name: 'Rangliste' });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('row').nth(3)).toContainText('Ben');
  await expect(page.getByText('2 Turniere')).toBeVisible();

  // Saison 2027
  await page.getByRole('group', { name: 'Saison' }).getByRole('button', { name: /2027/ }).click();
  await expect(table.getByRole('row')).toHaveCount(3);
  expect(queries.at(-1)).toBe('?season=s-2027');

  // Zeitraum zusätzlich
  await page.getByLabel('Von', { exact: true }).fill('2027-01-01');
  await expect.poll(() => queries.at(-1)).toBe('?season=s-2027&from=2027-01-01');
  await page.getByRole('button', { name: 'Zeitraum zurücksetzen' }).click();
  await page.getByRole('group', { name: 'Saison' }).getByRole('button', { name: 'Gesamt' }).click();
  await expect.poll(() => queries.at(-1)).toBe('');

  // Statistik von Chris
  await page.getByRole('row', { name: 'Statistik von Chris' }).click();
  const stats = page.getByTestId('player-stats');
  await expect(stats).toContainText('2 · 1 Sieg');
  await expect(stats).toContainText('1× Platz 1, 1× Platz 3');
  await expect(stats).toContainText('3-0-3 · 50 %');
  await expect(stats).toContainText('7:6 · 53,8 %');
  const records = stats.getByTestId('records');
  await expect(records.getByRole('listitem', { name: 'Peter' })).toContainText('1-0-1');

  // Zahlen stehen in jeder Zeile genau untereinander
  const rightEdges = await records
    .locator('li > .num:nth-child(2)')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().right)));
  expect(rightEdges).toHaveLength(3);
  expect(new Set(rightEdges).size).toBe(1);

  // Mit welchen Farben am besten
  await stats.getByRole('group', { name: 'Bilanz' }).getByRole('button', { name: 'Meine Farben' }).click();
  await expect(records.getByRole('listitem')).toHaveCount(2);
  await expect(records.getByRole('listitem').first()).toHaveAccessibleName('Grün');
  await expect(records.getByRole('listitem').first()).toContainText('2-0-0');
  await expect(records.getByRole('listitem').first()).toContainText('100 %');

  // Gegen welche Farben am häufigsten verloren
  await stats.getByRole('group', { name: 'Bilanz' }).getByRole('button', { name: 'Gegen Farben' }).click();
  await expect(records.getByRole('listitem').first()).toHaveAccessibleName('Rot');
  await expect(records.getByRole('listitem').first()).toContainText('0-0-2');
  await expect(records.getByRole('listitem', { name: 'Farblos' })).toContainText('1-0-1');

  // Auswahl bleibt beim nächsten Öffnen erhalten
  await stats.getByRole('button', { name: 'Statistik schließen' }).click();
  await page.getByRole('row', { name: 'Statistik von Chris' }).click();
  await expect(
    page.getByTestId('player-stats').getByRole('button', { name: 'Gegen Farben' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // passt auf das Handy
  const tooWide = await page.evaluate(() =>
    [...document.querySelectorAll('main *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length,
  );
  expect(tooWide).toBe(0);
});

test('Leere Rangliste', async ({ page }) => {
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
  await page.route(`**/api/v1/groups/${GROUP}/seasons`, (route) => json(route, 200, []));
  await page.route(`**/api/v1/groups/${GROUP}/leaderboard**`, (route) => json(route, 200, { tournaments: 0, rows: [] }));
  await page.goto('/rangliste');
  await expect(page.getByTestId('empty')).toHaveText('Noch keine abgeschlossenen Turniere.');
});

test('Elo-Leiter, Vergleich mit mir und letzte Matches (AP-5)', async ({ page }) => {
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
  await page.route(`**/api/v1/groups/${GROUP}/seasons`, (route) => json(route, 200, []));
  const elo = (r: ReturnType<typeof row>, value: number, matches: number, trend: number[]) => ({
    ...r,
    elo: value,
    elo_matches: matches,
    elo_trend: trend,
  });
  await page.route(`**/api/v1/groups/${GROUP}/leaderboard**`, (route) =>
    json(route, 200, {
      tournaments: 2,
      rows: [
        elo(row(1, PETER, 'Peter', 10, 12), 1061, 38, [1000, 1010, 1020, 1030, 1040, 1050, 1055, 1061]),
        elo(row(2, 'p-ben', 'Ben', 8, 9), 1084, 41, [1060, 1062, 1065, 1070, 1072, 1078, 1080, 1084]),
        elo(row(3, 'p-finn', 'Finn', 4, 3), 900, 9, [1000, 990, 970, 950, 940, 930, 910, 900]),
      ],
    }),
  );
  await page.route(`**/api/v1/groups/${GROUP}/players/p-ben/stats**`, (route) =>
    json(route, 200, {
      player_id: 'p-ben',
      display_name: 'Ben',
      elo: 1084,
      elo_matches: 41,
      elo_global: 1084,
      elo_history: [
        { played_on: '2026-12-27', rating: 1078, delta: 6, opponent_id: 'p-finn', opponent: 'Finn' },
        { played_on: '2026-12-27', rating: 1084, delta: 6.4, opponent_id: PETER, opponent: 'Peter' },
      ],
      tournaments: 2,
      tournament_wins: 0,
      ranking_points: 8,
      places: { '2': 2 },
      avg_place: 2,
      matches: { wins: 4, draws: 0, losses: 2 },
      match_win_rate: 66.7,
      games_won: 9,
      games_lost: 5,
      games_drawn: 0,
      game_win_rate: 64.3,
      colors: [],
      combos: [],
      opponents: [],
      with_colors: [],
      vs_colors: [],
    }),
  );

  await page.goto('/rangliste');
  await page.getByRole('button', { name: 'Elo', exact: true }).click();
  const ladder = page.getByRole('list', { name: 'Rangliste nach Elo' });
  await expect(ladder.getByRole('button')).toHaveText([/^1Ben.*1084$/, /^2Peter.*1061$/, /^3Finn.*noch neu.*900$/]);

  await ladder.getByRole('button', { name: /Ben/ }).click();
  const card = page.getByTestId('player-stats');
  await expect(card.getByTestId('elo-duel')).toContainText('1061');
  await expect(card.getByTestId('elo-duel')).toContainText('1084');
  // Peter (1061, 38 Matches) gegen Ben (1084): K = 32, erwartet 0,467 → +17 / −15
  await expect(card).toContainText('Ein Sieg gegen Ben bringt dir +17, eine Niederlage kostet −15.');
  await expect(card.getByRole('list', { name: 'Letzte Matches mit Elo-Änderung' }).getByRole('listitem')).toHaveText([
    /\+6 · Peter/,
    /\+6 · Finn/,
  ]);

  // Die Wahl „Elo“ bleibt nach dem Neuladen
  await page.reload();
  await expect(page.getByRole('list', { name: 'Rangliste nach Elo' })).toBeVisible();
});

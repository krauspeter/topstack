import { type Page, type Route, expect, test } from '@playwright/test';

/** Mehrere Gruppen (Phase 5, AP-1, ADR-0018): Umschalter, Gruppe anlegen und verwalten. */
test.use({ serviceWorkers: 'block' });

const A = { id: 'g-a', name: 'Draft-Runde', role: 'admin', player_id: 'p-a', archived: false, has_image: false };
const B = { id: 'g-b', name: 'Freitagsrunde', role: 'member', player_id: 'p-b', archived: false, has_image: false };
const OLD = { id: 'g-old', name: 'Alte Runde', role: 'viewer', player_id: null, archived: true, has_image: false };

const me = (groups: unknown[]) => ({
  id: 'u-anna',
  email: 'anna@example.org',
  display_name: 'Anna',
  favorite_colors: '',
  locale: 'de',
  has_passkey: true,
  groups,
});

const RULES = {
  match_points_win: 3,
  match_points_draw: 1,
  match_points_loss: 0,
  starting_life: 20,
  games_to_win: 2,
  extra_turns: 5,
  boosters_per_player: 3,
  match_time_limit_min: null,
  placement_bonus: [2, 1],
  season_mode: 'calendar_year',
  season_months: null,
};

const detail = (g: typeof A, extra: Record<string, unknown> = {}) => ({
  ...g,
  created_at: '2026-11-28T10:00:00Z',
  rules: RULES,
  pending_rules: null,
  can_manage: g.role === 'admin',
  can_invite: g.role === 'admin',
  can_play: g.role !== 'viewer',
  can_view_profiles: g.role !== 'viewer',
  ...extra,
});

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockMe(page: Page, groups: unknown[]) {
  let current = me(groups);
  await page.route('**/api/v1/me', (route) => json(route, current));
  await page.route('**/api/v1/me/deleted-groups', (route) => json(route, []));
  return (next: unknown[]) => {
    current = me(next);
  };
}

test('Umschalter: Turniere und Rangliste folgen der gewählten Gruppe', async ({ page }) => {
  await mockMe(page, [A, B]);
  const asked: string[] = [];
  await page.route('**/api/v1/groups/*/tournaments', (route) => {
    asked.push(new URL(route.request().url()).pathname);
    return json(route, []);
  });
  await page.route('**/api/v1/groups/*/seasons', (route) => json(route, []));
  await page.route('**/api/v1/groups/*/leaderboard*', (route) => json(route, { tournaments: 0, rows: [] }));

  await page.goto('/turnier');
  const switcher = page.getByLabel('Gruppe wählen');
  await expect(switcher).toHaveValue(A.id);
  await expect(page.getByRole('button', { name: 'Draft-Turnier starten' })).toBeVisible();

  await switcher.selectOption(B.id);
  await expect.poll(() => asked.at(-1)).toBe(`/api/v1/groups/${B.id}/tournaments`);

  // Die Auswahl gilt auf dem Gerät weiter, auch nach dem Neuladen und in der Rangliste
  await page.goto('/rangliste');
  await expect(page.getByLabel('Gruppe wählen')).toHaveValue(B.id);
});

test('Archivierte Gruppe: nur lesen, kein Turnier-Start', async ({ page }) => {
  await mockMe(page, [OLD]);
  await page.route('**/api/v1/groups/*/tournaments', (route) => json(route, []));
  await page.goto('/turnier');
  await expect(page.getByText('Diese Gruppe ist archiviert und nur noch lesbar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draft-Turnier starten' })).toHaveCount(0);
});

test('Gruppe anlegen, Regeln vormerken und Rollen vergeben', async ({ page }) => {
  const setGroups = await mockMe(page, [A]);
  const NEW = { id: 'g-new', name: 'Freitagsrunde', role: 'admin', player_id: 'p-n', archived: false, has_image: false };
  let created: unknown = null;
  let rulesPatch: unknown = null;
  let roleChange: unknown = null;

  await page.route('**/api/v1/groups/*/players', (route) => json(route, []));
  await page.route('**/api/v1/groups', (route) => {
    created = route.request().postDataJSON();
    setGroups([A, NEW]);
    return json(route, detail(NEW), 201);
  });
  await page.route(`**/api/v1/groups/${NEW.id}`, (route) => json(route, detail(NEW)));
  await page.route(`**/api/v1/groups/${NEW.id}/members`, (route) =>
    json(route, [
      { user_id: 'u-anna', display_name: 'Anna', role: 'admin', joined_at: '2026-11-28T10:00:00Z', player_id: 'p-n', is_me: true },
      { user_id: 'u-ben', display_name: 'Ben', role: 'member', joined_at: '2026-11-28T11:00:00Z', player_id: 'p-ben', is_me: false },
    ]),
  );
  await page.route(`**/api/v1/groups/${NEW.id}/rules`, (route) => {
    rulesPatch = route.request().postDataJSON();
    return json(route, { applied_now: false, group: detail(NEW, { pending_rules: { starting_life: 30 } }) });
  });
  await page.route(`**/api/v1/groups/${NEW.id}/members/u-ben/role`, (route) => {
    roleChange = route.request().postDataJSON();
    return json(route, [
      { user_id: 'u-anna', display_name: 'Anna', role: 'admin', joined_at: '2026-11-28T10:00:00Z', player_id: 'p-n', is_me: true },
      { user_id: 'u-ben', display_name: 'Ben', role: 'viewer', joined_at: '2026-11-28T11:00:00Z', player_id: 'p-ben', is_me: false },
    ]);
  });

  await page.goto('/profil');
  await page.getByLabel('Neue Gruppe anlegen').fill('Freitagsrunde');
  await page.getByRole('button', { name: 'Gruppe anlegen' }).click();
  expect(created).toEqual({ name: 'Freitagsrunde' });
  await expect(page).toHaveURL(/\/gruppe\/g-new$/);
  await expect(page.getByRole('heading', { name: 'Freitagsrunde' })).toBeVisible();

  await page.getByLabel('Startleben').fill('30');
  await page.getByRole('button', { name: 'Regeln speichern' }).click();
  expect(rulesPatch).toEqual({ starting_life: 30 });
  await expect(page.getByText('Ab der nächsten Saison:')).toBeVisible();
  await expect(page.getByText('30 Leben')).toBeVisible();

  await page.getByLabel('Rolle von Ben').selectOption('viewer');
  await expect(page.getByRole('status')).toHaveText('Rolle geändert.');
  expect(roleChange).toEqual({ role: 'viewer' });
});

test('Mitglied sieht Rollen, aber keine Verwaltung', async ({ page }) => {
  await mockMe(page, [B]);
  await page.route('**/api/v1/groups/*/players', (route) => json(route, []));
  await page.route(`**/api/v1/groups/${B.id}`, (route) => json(route, detail(B)));
  await page.route(`**/api/v1/groups/${B.id}/members`, (route) =>
    json(route, [{ user_id: 'u-anna', display_name: 'Anna', role: 'member', joined_at: '2026-11-28T10:00:00Z', player_id: 'p-b', is_me: true }]),
  );
  await page.goto(`/gruppe/${B.id}`);
  await expect(page.getByRole('heading', { name: 'Freitagsrunde' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gruppe verlassen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gruppe löschen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Regeln speichern' })).toHaveCount(0);
  await expect(page.getByLabel('Rolle von Anna')).toHaveCount(0);
});

test('Einladungslinks: erzeugen, offene ansehen, zurückziehen (AP-2)', async ({ page }) => {
  await mockMe(page, [B]);
  let links = [] as unknown[];
  let revoked = '';
  await page.route('**/api/v1/groups/*/players', (route) => json(route, []));
  await page.route(`**/api/v1/groups/${B.id}`, (route) => json(route, detail(B, { can_invite: true })));
  await page.route(`**/api/v1/groups/${B.id}/members`, (route) => json(route, []));
  await page.route(`**/api/v1/groups/${B.id}/invitations`, (route) => {
    if (route.request().method() === 'POST') {
      links = [{ id: 'abc', created_by: 'Anna', mine: true, expires_at: '2026-12-05T10:00:00Z', uses: 0, max_uses: null, player_name: null }];
      return json(route, { token: 'tok', url: 'https://topstack.win/einladung/tok', expires_at: '2026-12-05T10:00:00Z', max_uses: null }, 201);
    }
    return json(route, links);
  });
  await page.route(`**/api/v1/groups/${B.id}/invitations/abc`, (route) => {
    revoked = 'abc';
    links = [];
    return route.fulfill({ status: 204 });
  });

  await page.goto(`/gruppe/${B.id}`);
  await page.getByRole('button', { name: 'Einladungslink erstellen' }).click();
  await expect(page.getByLabel(`Neuer Einladungslink für ${B.name}`)).toHaveValue('https://topstack.win/einladung/tok');
  const open = page.getByRole('list', { name: 'Offene Einladungslinks' });
  await expect(open.getByRole('listitem')).toHaveCount(1);
  await expect(open).toContainText('Von dir');
  await open.getByRole('button', { name: 'Link zurückziehen' }).click();
  await expect(open).toHaveCount(0);
  expect(revoked).toBe('abc');
});

test('Spieler zusammenführen: Vorschau, dann übernehmen (AP-2)', async ({ page }) => {
  await mockMe(page, [A]);
  let applied: unknown = null;
  const everyone = [
    { id: 'p-ben', display_name: 'Ben', kind: 'member', is_me: false },
    { id: 'p-gast', display_name: 'Ben B.', kind: 'guest', is_me: false },
  ];
  await page.route('**/api/v1/groups/*/players', (route) => json(route, []));
  await page.route('**/api/v1/groups/*/players?all=true', (route) => json(route, applied ? everyone.slice(0, 1) : everyone));
  await page.route(`**/api/v1/groups/${A.id}`, (route) => json(route, detail(A)));
  await page.route(`**/api/v1/groups/${A.id}/members`, (route) => json(route, []));
  await page.route(`**/api/v1/groups/${A.id}/invitations`, (route) => json(route, []));
  await page.route(`**/api/v1/groups/${A.id}/players/merge`, (route) => {
    const body = route.request().postDataJSON() as { apply: boolean };
    if (body.apply) applied = body;
    return json(route, { source: 'Ben B.', target: 'Ben', tournaments: 2, matches: 5, merged: body.apply });
  });

  await page.goto(`/gruppe/${A.id}`);
  const merge = page.getByRole('region', { name: 'Spieler zusammenführen' });
  await merge.getByLabel('Dieser Spieler …').selectOption('p-gast');
  await merge.getByLabel('… geht auf in').selectOption('p-ben');
  await merge.getByRole('button', { name: 'Vorschau' }).click();
  await expect(merge).toContainText('2 Turnier(e), 5 Match(es)');
  await merge.getByRole('button', { name: 'Jetzt zusammenführen' }).click();
  await expect(page.getByRole('status')).toHaveText('Ben B. ist jetzt Ben.');
  expect(applied).toEqual({ source_id: 'p-gast', target_id: 'p-ben', apply: true });
});

test('Gast bekommt nach dem Beitritt das Angebot „Profil anlegen“ (UC-05)', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{"status":401}' }));
  await page.route('**/api/v1/guest/tok', (route) =>
    route.request().method() === 'POST'
      ? json(route, { tournament_id: 't-1', player_id: 'p-g', display_name: 'Gina', claim_url: 'https://topstack.win/einladung/claim1' }, 201)
      : json(route, { group_name: 'Draft-Runde', set_code: 'DSK', open: true }),
  );
  await page.goto('/gast/tok');
  await page.getByLabel('Dein Name').fill('Gina');
  await page.getByRole('button', { name: 'Als Gast mitspielen' }).click();
  await expect(page.getByRole('heading', { name: 'Du bist dabei, Gina!' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Profil anlegen' })).toHaveAttribute('href', '/einladung/claim1');
});

test('Turnier mit eigenen Regeln starten (AP-3)', async ({ page }) => {
  await mockMe(page, [A]);
  let body: unknown = null;
  await page.route(`**/api/v1/groups/${A.id}`, (route) => json(route, detail(A)));
  await page.route(`**/api/v1/groups/${A.id}/tournaments`, (route) => {
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON();
      return json(route, { id: 't-neu' }, 201);
    }
    return json(route, []);
  });
  await page.route('**/api/v1/tournaments/t-neu', (route) => route.abort());

  await page.goto('/turnier');
  await page.getByLabel('Name des Drafts, z. B. Mirrodin oder DSK').fill('DSK');
  await page.getByText('Regeln für dieses Turnier anpassen').click();
  await page.getByLabel('Matchformat').selectOption('1');
  await page.getByLabel('Startleben').fill('30');
  await page.getByRole('button', { name: 'Draft-Turnier starten' }).click();
  await expect.poll(() => body).toEqual({ set_code: 'DSK', rules: { games_to_win: 1, starting_life: 30 } });
});

import { type Page, expect, test } from '@playwright/test';

async function startMatch(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neues Match' }).click();
  await page.getByLabel('Spieler 1').fill('Anna');
  await page.getByLabel('Spieler 2').fill('Ben');
  await page.getByRole('button', { name: 'Weiter zum W20-Wurf' }).click();

  const anna = page.getByRole('button', { name: 'Anna würfelt' });
  const ben = page.getByRole('button', { name: 'Ben würfelt' });
  const start = page.getByRole('button', { name: 'Ich beginne' });
  // Bei Gleichstand setzt die App die Würfel zurück, dann wird neu gewürfelt.
  await expect(async () => {
    if (await anna.isEnabled()) await anna.click();
    if (await ben.isEnabled()) await ben.click();
    await expect(start).toBeEnabled({ timeout: 2500 });
  }).toPass({ timeout: 30_000 });
  await start.click();
}

test('Lebenspunkte zählen, Rückgängig, Spielstand übersteht Neuladen', async ({ page }) => {
  await startMatch(page);
  await expect(page.getByTestId('life-p1')).toHaveText('20');
  await expect(page.getByTestId('life-p2')).toHaveText('20');

  await page.getByRole('button', { name: 'Ben −1' }).click();
  await expect(page.getByTestId('life-p2')).toHaveText('19');

  // Langes Drücken zählt in Fünferschritten
  await page.getByRole('button', { name: 'Anna −1' }).hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByTestId('life-p1')).toHaveText('15');

  await page.reload();
  await expect(page.getByTestId('life-p1')).toHaveText('15');
  await expect(page.getByTestId('life-p2')).toHaveText('19');

  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('life-p1')).toHaveText('20');
});

test('Best-of-3 bis zum Matchsieg', async ({ page }) => {
  await startMatch(page);

  const concede = async (who: string) => {
    await page.getByRole('button', { name: 'Menü' }).click();
    await page.getByRole('button', { name: `${who} gibt auf` }).click();
    await page.getByRole('button', { name: 'Ja, Spiel beenden' }).click();
  };

  await concede('Ben');
  await expect(page.getByRole('heading', { name: /Ben, wer beginnt Spiel 2/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ich beginne' }).click();
  await expect(page.getByTestId('score')).toContainText('Spiel 2');
  await expect(page.getByTestId('life-p2')).toHaveText('20');

  await concede('Ben');
  await expect(page.getByTestId('match-winner')).toHaveText('Anna gewinnt');
  await expect(page.getByText('2:0')).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('button', { name: 'Neues Match' })).toBeVisible();
});

test('Draftplätze auslosen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Draftplätze auslosen' }).click();
  for (const name of ['Anna', 'Ben', 'Chris', 'Dana', 'Eli']) {
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Name').press('Enter');
  }
  await page.getByRole('button', { name: 'Plätze auslosen' }).click();
  await expect(page.getByTestId('seats').locator('li')).toHaveCount(5, { timeout: 5000 });
  await expect(page.getByRole('button', { name: /Booster 1, nach links/ })).toBeVisible();
  await page.getByRole('button', { name: /Booster 1/ }).click();
  await expect(page.getByRole('button', { name: /Booster 2, nach rechts/ })).toBeVisible();
});

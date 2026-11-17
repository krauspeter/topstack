import { expect, test } from '@playwright/test';

test('Startseite zeigt beide Spieler mit 20 Leben', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('life-a')).toHaveText('20');
  await expect(page.getByTestId('life-b')).toHaveText('20');
  await page.getByRole('button', { name: 'Spieler B −1' }).click();
  await expect(page.getByTestId('life-b')).toHaveText('19');
});

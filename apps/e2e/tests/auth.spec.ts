import { expect, test } from '@playwright/test';
import { login, USERS } from './helpers';

test('hatalı şifre hata mesajı gösterir', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-posta').fill(USERS.cashier.email);
  await page.getByLabel('Şifre').fill('yanlis-sifre');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı');
});

test('rol menüleri ve yasak sayfa yönlendirmesi', async ({ page }) => {
  await login(page, 'worker');
  const nav = page.getByRole('navigation', { name: 'Ana menü' });
  await expect(nav.getByRole('link')).toHaveText(['İş Emirleri']);
  await page.goto('/raporlar');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Bana atanan işler' })).toBeVisible();
});

test('yönetici tüm menüleri görür; çıkış sonrası oturum kapanır', async ({ page }) => {
  await login(page, 'admin');
  const nav = page.getByRole('navigation', { name: 'Ana menü' });
  for (const l of ['Müşteriler', 'Kasa', 'Hizmetler', 'Kullanıcılar', 'Raporlar', 'Ayarlar']) await expect(nav.getByRole('link', { name: l })).toBeVisible();
  await page.getByRole('button', { name: 'Çıkış' }).click();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
});

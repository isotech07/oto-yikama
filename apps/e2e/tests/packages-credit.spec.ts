import { expect, test } from '@playwright/test';
import { createWorkOrder, newSession, randomPlate, uniqueName } from './helpers';

test('paket tanımla, sat, iş emrinde kullan: kalem 0 TL ve kredi düşer', async ({ browser }) => {
  const admin = await newSession(browser, 'admin');
  const pkgName = uniqueName('3 Dış Yıkama');
  await admin.goto('/hizmetler');
  await admin.getByRole('button', { name: '+ Yeni paket' }).click();
  await admin.getByLabel('Ad', { exact: true }).fill(pkgName);
  await admin.getByLabel('Hizmet').selectOption({ label: 'Dış Yıkama' });
  await admin.getByLabel('Kredi').fill('3');
  await admin.getByLabel('Paket fiyatı (₺)').fill('600');
  await admin.getByRole('button', { name: 'Kaydet' }).click();
  await expect(admin.getByRole('row', { name: new RegExp(pkgName) })).toBeVisible();

  const cashier = await newSession(browser, 'cashier');
  const customer = uniqueName('Paketli Müşteri');
  const plate = randomPlate();
  // Müşteriyi ilk iş emriyle oluştur, sonra paketi sat
  const firstUrl = await createWorkOrder(cashier, { plate, customer: { name: customer }, services: ['Motor Yıkama'] });
  await cashier.getByRole('link', { name: customer }).click();
  await cashier.getByRole('button', { name: '+ Paket sat' }).click();
  await cashier.getByLabel('Paket', { exact: true }).selectOption({ label: `${pkgName} · 600,00 ₺` });
  await cashier.getByRole('button', { name: 'Tahsil et ve paketi tanımla' }).click();
  await expect(cashier.getByText(pkgName)).toBeVisible();
  await expect(cashier.getByText('3/3')).toBeVisible();

  // İlk iş emrini iptal et ki aynı araçla paketten yeni iş açılabilsin
  await cashier.goto(firstUrl);
  await cashier.getByRole('button', { name: 'İptal et' }).click();
  await expect(cashier.getByRole('button', { name: 'İptal et' })).toHaveCount(0);
  await expect(cashier.getByRole('heading').getByText('İptal', { exact: true })).toBeVisible();

  await createWorkOrder(cashier, { plate, services: ['Dış Yıkama'], usePackageFor: 'Dış Yıkama' });
  await expect(cashier.getByRole('row', { name: /Dış Yıkama \(paket\)/ })).toContainText('0,00 ₺');
  await expect(cashier.locator('dl div', { hasText: /^Toplam/ }).locator('dd')).toHaveText('0,00 ₺');
  await cashier.getByRole('link', { name: customer }).click();
  await expect(cashier.getByText('2/3')).toBeVisible();
});

test('veresiye: yönetici izin verir, kasiyer borçla teslim eder, borç görünür', async ({ browser }) => {
  const cashier = await newSession(browser, 'cashier');
  const customer = uniqueName('Filo Şirketi');
  const url = await createWorkOrder(cashier, { plate: randomPlate(), customer: { name: customer }, services: ['İç-Dış Yıkama'] });
  for (const s of ['Yıkamaya başla', 'Kurulamaya geç', 'Hazır']) await cashier.getByRole('button', { name: s }).click();
  await expect(cashier.getByText(/Teslim için önce kalan 450,00/)).toBeVisible();

  const admin = await newSession(browser, 'admin');
  await admin.goto(url);
  await admin.getByRole('link', { name: customer }).click();
  await admin.getByRole('button', { name: 'değiştir' }).click();
  await admin.getByLabel(/ödemeden teslim alabilir/).check();
  await admin.getByLabel('Borç limiti (₺)').fill('1000');
  await admin.getByRole('button', { name: 'Kaydet' }).click();
  await expect(admin.getByText(/Veresiye: açık \(limit 1\.000,00 ₺\)/)).toBeVisible();

  await cashier.goto(url);
  await cashier.getByRole('button', { name: 'Veresiye teslim et' }).click();
  await expect(cashier.getByText('Teslim edildi').first()).toBeVisible();
  await cashier.getByRole('link', { name: customer }).click();
  await expect(cashier.getByText(/Açık borç: 450,00 ₺/)).toBeVisible();

  // Sonradan tahsilat borcu kapatır
  await cashier.goto(url);
  await cashier.getByRole('radio', { name: 'Havale/EFT' }).click();
  await cashier.getByRole('button', { name: 'Tahsil et' }).click();
  await expect(cashier.getByText('Kalan', { exact: true }).locator('..')).toContainText('0,00 ₺');
});

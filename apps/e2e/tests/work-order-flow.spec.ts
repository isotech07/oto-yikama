import { expect, test } from '@playwright/test';
import { createWorkOrder, newSession, randomPlate, uniqueName } from './helpers';

test('kasiyer açar, personel telefonda yıkar, kasiyer parçalı tahsil edip teslim eder, fiş basılır', async ({ browser }) => {
  const cashier = await newSession(browser, 'cashier');
  const plate = randomPlate();
  const name = uniqueName('Elif Şahin');
  const url = await createWorkOrder(cashier, {
    plate,
    customer: { name, phone: '0544 321 54 76' },
    services: ['Dış Yıkama', 'Motor Yıkama'],
    worker: 'Mehmet Personel',
  });
  await expect(cashier.locator('dl div', { hasText: /^Toplam/ }).locator('dd')).toHaveText('550,00 ₺');

  // Aynı plakaya ikinci iş emri açılamaz
  await cashier.goto('/yeni');
  await cashier.getByLabel('Plaka').fill(plate);
  await expect(cashier.getByText(/açık iş emri var/)).toBeVisible();
  await expect(cashier.getByRole('button', { name: 'İş emrini aç' })).toBeDisabled();

  // Personel telefondan ilerletir; teslim ve iptal düğmesi görmez
  const worker = await newSession(browser, 'worker', true);
  const card = worker.locator('article', { hasText: plate });
  for (const step of ['Yıkamaya başla', 'Kurulamaya geç', 'Hazır']) {
    await card.getByRole('button', { name: step }).click();
    await expect(card.getByRole('button', { name: step })).toHaveCount(0);
  }
  await expect(card.getByRole('button', { name: /Teslim|İptal/ })).toHaveCount(0);

  // Kasiyer: ödeme bitmeden teslim yok; iki parça tahsilat; teslim
  await cashier.goto(url);
  await expect(cashier.getByText(/Teslim için önce kalan 550,00/)).toBeVisible();
  await expect(cashier.getByRole('button', { name: /Teslim et/ })).toHaveCount(0);
  await cashier.getByLabel('Tutar (₺)').fill('300');
  await cashier.getByRole('button', { name: 'Tahsil et' }).click();
  await expect(cashier.getByLabel('Tutar (₺)')).toHaveValue('250,00');
  await cashier.getByRole('radio', { name: 'Kart' }).click();
  await cashier.getByRole('button', { name: 'Tahsil et' }).click();
  await cashier.getByRole('button', { name: 'Teslim et' }).click();
  await expect(cashier.getByText('Teslim edildi').first()).toBeVisible();

  // Bilgi fişi
  await cashier.getByRole('link', { name: /Bilgi fişi/ }).click();
  const receipt = cashier.locator('article.receipt');
  await expect(receipt).toContainText('MALİ DEĞERİ YOKTUR');
  await expect(receipt).toContainText(name);
  await expect(receipt.getByText('TOPLAM', { exact: true }).locator('..')).toContainText('550,00 ₺');
  await expect(receipt).toContainText('Toplam KDV');
});

test('fiyat değişikliği açılmış iş emrini etkilemez', async ({ browser }) => {
  const cashier = await newSession(browser, 'cashier');
  const url = await createWorkOrder(cashier, { plate: randomPlate(), services: ['Dış Yıkama'] });
  const admin = await newSession(browser, 'admin');
  await admin.goto('/hizmetler');
  const row = admin.getByRole('row', { name: /^Dış Yıkama/ }).first();
  await row.getByRole('button', { name: 'Düzenle' }).click();
  await admin.getByLabel('Fiyat (₺, KDV dahil)').fill('275');
  await admin.getByRole('button', { name: 'Kaydet' }).click();
  await expect(admin.getByRole('row', { name: /^Dış Yıkama/ }).first()).toContainText('275,00 ₺');
  try {
    await cashier.goto(url);
    await expect(cashier.getByRole('row', { name: /^Dış Yıkama/ })).toContainText('250,00 ₺');
  } finally {
    await admin.getByRole('row', { name: /^Dış Yıkama/ }).first().getByRole('button', { name: 'Düzenle' }).click();
    await admin.getByLabel('Fiyat (₺, KDV dahil)').fill('250');
    await admin.getByRole('button', { name: 'Kaydet' }).click();
    await expect(admin.getByRole('row', { name: /^Dış Yıkama/ }).first()).toContainText('250,00 ₺');
  }
});

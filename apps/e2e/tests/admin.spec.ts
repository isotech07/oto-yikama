import { expect, test } from '@playwright/test';
import { createWorkOrder, newSession, randomPlate, uniqueName } from './helpers';

test('kasa kapanışı: fark varsa açıklama ister, kayıt geçmişte görünür', async ({ browser }) => {
  const admin = await newSession(browser, 'admin');
  await admin.goto('/kasa');
  // Kalıcı e2e veritabanında bugünü kapatmamak için rastgele geçmiş bir gün
  const d = new Date(Date.UTC(2001 + Math.floor(Math.random() * 20), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27)));
  const day = d.toISOString().slice(0, 10);
  await admin.getByLabel('Gün').fill(day);
  await admin.getByLabel('Kasa başı para (₺)').fill('500');
  await admin.getByLabel('Sayılan nakit (₺)').fill('480');
  await expect(admin.getByRole('status').filter({ hasText: 'Fark' })).toContainText('-20,00 ₺ (eksik)');
  await admin.getByRole('button', { name: 'Günü kapat' }).click();
  await expect(admin.getByRole('alert')).toHaveText('Kasa farkı varsa açıklama zorunlu');
  await admin.getByLabel('Fark açıklaması (zorunlu)').fill('Bozuk para eksik');
  await admin.getByRole('button', { name: 'Günü kapat' }).click();
  await expect(admin.getByText(/Bu gün .* tarihinde Yönetici tarafından kapatıldı/)).toBeVisible();
  await expect(admin.getByRole('row', { name: new RegExp(day) })).toContainText('-20,00 ₺');
});

test('ayarlar fişe yansır; SMS açıkken rızalı müşteriye bildirim kuyruğa girer', async ({ browser }) => {
  const admin = await newSession(browser, 'admin');
  const shop = uniqueName('Parlak Oto');
  await admin.goto('/ayarlar');
  await admin.getByLabel('İşletme adı').fill(shop);
  await admin.getByLabel(/Hazır olunca müşteriye SMS gönder/).check();
  await admin.getByRole('button', { name: 'Kaydet' }).click();
  await expect(admin.getByText('Kaydedildi')).toBeVisible();

  const cashier = await newSession(browser, 'cashier');
  await createWorkOrder(cashier, {
    plate: randomPlate(),
    customer: { name: uniqueName('Rızalı'), phone: '0532 765 43 21', sms: true },
    services: ['Dış Yıkama'],
  });
  for (const s of ['Yıkamaya başla', 'Kurulamaya geç', 'Hazır']) await cashier.getByRole('button', { name: s }).click();
  // Testte gönderici kapalı (NOTIFY_WORKER=off): bildirim sırada görünür
  await expect(cashier.getByText(/SMS: sırada/)).toBeVisible();
  await cashier.getByRole('link', { name: /Bilgi fişi/ }).click();
  await expect(cashier.locator('article.receipt')).toContainText(shop);

  await admin.goto('/ayarlar');
  await admin.getByLabel(/Hazır olunca müşteriye SMS gönder/).uncheck();
  await admin.getByRole('button', { name: 'Kaydet' }).click();
  await expect(admin.getByText('Kaydedildi')).toBeVisible();
});

test('rapor ekranı paket, alacak ve kasa kartlarını gösterir', async ({ browser }) => {
  const admin = await newSession(browser, 'admin');
  await admin.goto('/raporlar');
  for (const l of ['Kasa (tahsilat)', 'Ciro (teslim + paket)', 'Paket satışı', 'Açık alacak (veresiye)', 'Kasa farkı']) {
    await expect(admin.getByText(l, { exact: true })).toBeVisible();
  }
});

test('personel atanmamış işi göremez', async ({ browser }) => {
  const cashier = await newSession(browser, 'cashier');
  const plate = randomPlate();
  await createWorkOrder(cashier, { plate, services: ['Dış Yıkama'] });
  const worker = await newSession(browser, 'worker');
  await expect(worker.getByRole('heading', { name: 'Bana atanan işler' })).toBeVisible();
  await expect(worker.getByText(plate)).toHaveCount(0);
});

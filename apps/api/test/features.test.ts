import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { trDate } from '../src/domain/time';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Client, createTestApp, loginAs, randomPlate } from './helpers';

const prisma = new PrismaClient();
let app: INestApplication;
let admin: Client, cashier: Client, worker: Client;
let wash: { id: string }, wax: { id: string };

beforeAll(async () => {
  app = await createTestApp();
  admin = await loginAs(app, prisma, 'ADMIN');
  cashier = await loginAs(app, prisma, 'CASHIER');
  worker = await loginAs(app, prisma, 'WORKER');
  wash = (await admin.post('/api/services', { name: 'F Yıkama', priceKurus: 25000, vatRateBp: 2000 })).body;
  wax = (await admin.post('/api/services', { name: 'F Cila', priceKurus: 30000, vatRateBp: 2000 })).body;
});
afterAll(async () => {
  await prisma.businessSettings.update({ where: { id: 1 }, data: { smsEnabled: false } });
  await app.close();
  await prisma.$disconnect();
});

const customer = async (extra: object = {}) =>
  (await cashier.post('/api/customers', { name: `Müşteri ${Date.now()}`, phone: '05321234567', ...extra })).body;
async function order(customerId: string | null, items: object[] = [{ serviceId: wash.id }]) {
  const r = await cashier.post('/api/work-orders', { plate: randomPlate(), customerId, items, assignedWorkerId: worker.user.id });
  expect(r.status).toBe(201);
  return r.body;
}
const move = (c: Client, id: string, to: string) => c.post(`/api/work-orders/${id}/status`, { to });
async function toReady(id: string) {
  for (const s of ['YIKANIYOR', 'KURULANIYOR', 'HAZIR']) expect((await move(cashier, id, s)).status).toBe(201);
}
const pay = (c: Client, id: string, amountKurus: number, method = 'NAKIT') =>
  c.post(`/api/work-orders/${id}/payments`, { amountKurus, method, idempotencyKey: randomUUID() });

describe('işletme ayarları', () => {
  it('kasiyer okur ama değiştiremez; yönetici günceller; VKN doğrulanır', async () => {
    expect((await cashier.get('/api/settings')).status).toBe(200);
    expect((await cashier.patch('/api/settings', { name: 'X Yıkama' })).status).toBe(403);
    expect((await admin.patch('/api/settings', { taxNumber: '123' })).status).toBe(400);
    const r = await admin.patch('/api/settings', { name: 'Parlak Oto Yıkama', taxNumber: '1234567890', address: 'Test Cad. 1' });
    expect(r.body).toMatchObject({ name: 'Parlak Oto Yıkama', taxNumber: '1234567890' });
  });
});

describe('veresiye', () => {
  it('izinsiz müşteri ödemeden teslim alamaz', async () => {
    const c = await customer();
    const wo = await order(c.id);
    await toReady(wo.id);
    const r = await move(cashier, wo.id, 'TESLIM_EDILDI');
    expect(r.status).toBe(409);
  });

  it('veresiye ayarını yalnız yönetici yapar', async () => {
    const c = await customer();
    expect((await cashier.patch(`/api/customers/${c.id}`, { creditAllowed: true })).status).toBe(403);
    expect((await cashier.post('/api/customers', { name: 'Kendi İzni', creditAllowed: true })).status).toBe(403);
    expect((await admin.patch(`/api/customers/${c.id}`, { creditAllowed: true })).body.creditAllowed).toBe(true);
  });

  it('izinli müşteri bakiyeyle teslim alır; borç görünür, sonra tahsil edilir', async () => {
    const c = await customer();
    await admin.patch(`/api/customers/${c.id}`, { creditAllowed: true });
    const wo = await order(c.id);
    await toReady(wo.id);
    const ready = (await cashier.get(`/api/work-orders/${wo.id}`)).body;
    expect(ready.allowedNext).toContain('TESLIM_EDILDI');
    expect((await move(cashier, wo.id, 'TESLIM_EDILDI')).status).toBe(201);

    expect((await cashier.get(`/api/customers/${c.id}`)).body.outstandingKurus).toBe(25000);
    const unpaid = (await cashier.get('/api/work-orders?scope=unpaid&pageSize=100')).body;
    expect(unpaid.items.some((x: { id: string }) => x.id === wo.id)).toBe(true);

    expect((await pay(cashier, wo.id, 25000, 'HAVALE')).body.balanceKurus).toBe(0);
    expect((await cashier.get(`/api/customers/${c.id}`)).body.outstandingKurus).toBe(0);
  });

  it('limit aşılırsa teslim reddedilir', async () => {
    const c = await customer();
    await admin.patch(`/api/customers/${c.id}`, { creditAllowed: true, creditLimitKurus: 40000 });
    const a = await order(c.id);
    await toReady(a.id);
    expect((await move(cashier, a.id, 'TESLIM_EDILDI')).status).toBe(201); // borç 250
    const b = await order(c.id);
    await toReady(b.id);
    const r = await move(cashier, b.id, 'TESLIM_EDILDI'); // 250 + 250 > 400
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/limit/);
    await pay(cashier, b.id, 10000, 'KART'); // kalan 150 -> 250+150 = 400 olur
    expect((await move(cashier, b.id, 'TESLIM_EDILDI')).status).toBe(201);
  });

  it('personel açık alacak listesini göremez; rapor alacak toplamını içerir', async () => {
    expect((await worker.get('/api/work-orders?scope=unpaid')).status).toBe(403);
    const r = (await admin.get('/api/reports/summary')).body;
    expect(r.receivablesKurus).toBeGreaterThan(0);
  });
});

describe('paketler', () => {
  let pkg: { id: string };
  beforeAll(async () => {
    pkg = (await admin.post('/api/packages', { name: '3 Yıkama Paketi', serviceId: wash.id, credits: 3, priceKurus: 60000, validDays: 90 })).body;
  });

  it('kasiyer paket tanımlayamaz', async () => {
    expect((await cashier.post('/api/packages', { name: 'X', serviceId: wash.id, credits: 1, priceKurus: 1 })).status).toBe(403);
  });

  it('satış ödemeyle birlikte kaydedilir; aynı işlem anahtarı ikinci satış yapmaz', async () => {
    const c = await customer();
    const key = randomUUID();
    const before = (await admin.get('/api/reports/summary')).body;
    const [a, b] = await Promise.all([
      cashier.post(`/api/customers/${c.id}/packages`, { packageId: pkg.id, method: 'KART', idempotencyKey: key }),
      cashier.post(`/api/customers/${c.id}/packages`, { packageId: pkg.id, method: 'KART', idempotencyKey: key }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.customerPackage.count({ where: { customerId: c.id } })).toBe(1);
    const p = await prisma.payment.findMany({ where: { customerPackageId: a.body.id } });
    expect(p.map((x) => x.amountKurus)).toEqual([60000]);
    const after = (await admin.get('/api/reports/summary')).body;
    expect(after.packages.sold - before.packages.sold).toBe(1);
    expect(after.payments.byMethod.KART - before.payments.byMethod.KART).toBe(60000);
  });

  it('kredi kullanımı: kalem 0 TL, kredi düşer; çıkarılınca ve iptalde geri gelir', async () => {
    const c = await customer();
    const cp = (await cashier.post(`/api/customers/${c.id}/packages`, { packageId: pkg.id, method: 'KART', idempotencyKey: randomUUID() })).body;
    const wo = await order(c.id, [{ serviceId: wash.id, customerPackageId: cp.id }, { serviceId: wax.id }]);
    expect(wo.items[0]).toMatchObject({ unitPrice: 0, serviceName: 'F Yıkama (paket)' });
    expect(wo.totals.grossKurus).toBe(30000);
    const remaining = async () => (await prisma.customerPackage.findUniqueOrThrow({ where: { id: cp.id } })).remainingCredits;
    expect(await remaining()).toBe(2);

    await cashier.delete(`/api/work-orders/${wo.id}/items/${wo.items[0].id}`);
    expect(await remaining()).toBe(3);

    const wo2 = await order(c.id, [{ serviceId: wash.id, customerPackageId: cp.id, quantity: 2 }]);
    expect(await remaining()).toBe(1);
    await move(cashier, wo2.id, 'CANCELLED');
    expect(await remaining()).toBe(3);
  });

  it('yetersiz kredi, başka müşterinin paketi, yanlış hizmet ve süresi dolmuş paket reddedilir', async () => {
    const c = await customer();
    const other = await customer();
    const cp = (await cashier.post(`/api/customers/${c.id}/packages`, { packageId: pkg.id, method: 'KART', idempotencyKey: randomUUID() })).body;
    const tryUse = (cust: string, items: object[]) => cashier.post('/api/work-orders', { plate: randomPlate(), customerId: cust, items });
    expect((await tryUse(c.id, [{ serviceId: wash.id, customerPackageId: cp.id, quantity: 4 }])).status).toBe(409);
    expect((await tryUse(other.id, [{ serviceId: wash.id, customerPackageId: cp.id }])).status).toBe(409);
    expect((await tryUse(c.id, [{ serviceId: wax.id, customerPackageId: cp.id }])).status).toBe(409);
    await prisma.customerPackage.update({ where: { id: cp.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await tryUse(c.id, [{ serviceId: wash.id, customerPackageId: cp.id }])).status).toBe(409);
    // Başarısız denemeler krediyi düşürmemiş olmalı
    expect((await prisma.customerPackage.findUniqueOrThrow({ where: { id: cp.id } })).remainingCredits).toBe(3);
  });

  it('kredi DB seviyesinde eksiye düşemez', async () => {
    const c = await customer();
    const cp = (await cashier.post(`/api/customers/${c.id}/packages`, { packageId: pkg.id, method: 'KART', idempotencyKey: randomUUID() })).body;
    await expect(prisma.customerPackage.update({ where: { id: cp.id }, data: { remainingCredits: -1 } })).rejects.toThrow(/customer_packages_credits_chk/);
  });
});

describe('gün sonu kasa kapanışı', () => {
  it('önizleme o günün net nakdini gösterir', async () => {
    const today = trDate();
    const before = (await cashier.get(`/api/cash-closings/preview?date=${today}`)).body.cashInKurus;
    const wo = await order(null);
    await pay(cashier, wo.id, 12345, 'NAKIT');
    await pay(cashier, wo.id, 1000, 'KART');
    expect((await cashier.get(`/api/cash-closings/preview?date=${today}`)).body.cashInKurus - before).toBe(12345);
  });

  it('kapanış sonrası o güne nakit alınamaz, kart alınabilir; ikinci kapanış 409; kayıt değiştirilemez', async () => {
    // Kalıcı test veritabanında gerçek "bugün"ü kapatmamak için saati rastgele bir gelecek güne alıyoruz.
    const fake = new Date(Date.UTC(2100 + Math.floor(Math.random() * 800), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27), 9));
    const wo = await order(null);
    // Oturum süresi de sahte saate göre kontrol edilir; kasiyerin oturumunu uzat.
    await prisma.session.updateMany({ where: { userId: cashier.user.id }, data: { expiresAt: new Date(Date.UTC(3000, 0, 1)) } });
    vi.useFakeTimers({ toFake: ['Date'], now: fake });
    try {
      const date = trDate();
      expect((await cashier.post('/api/cash-closings', { date, openingFloatKurus: 50000, countedKurus: 49000 })).status).toBe(400); // fark var, açıklama yok
      const r = await cashier.post('/api/cash-closings', { date, openingFloatKurus: 50000, countedKurus: 49000, note: 'Bozuk para eksik' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ expectedKurus: 50000, differenceKurus: -1000 });
      expect((await cashier.post('/api/cash-closings', { date, openingFloatKurus: 0, countedKurus: 0 })).status).toBe(409);

      const cash = await pay(cashier, wo.id, 1000, 'NAKIT');
      expect(cash.status).toBe(409);
      expect(cash.body.message).toMatch(/kasası kapatıldı/);
      expect((await pay(cashier, wo.id, 1000, 'KART')).status).toBe(201);

      await expect(prisma.cashClosing.update({ where: { id: r.body.id }, data: { countedKurus: 50000 } })).rejects.toThrow(/değiştirilemez/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kasiyer geçmiş günü kapatamaz, kimse gelecek günü kapatamaz', async () => {
    const today = trDate();
    const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    expect((await cashier.post('/api/cash-closings', { date: '2020-01-01', openingFloatKurus: 0, countedKurus: 0 })).status).toBe(403);
    expect((await admin.post('/api/cash-closings', { date: tomorrow, openingFloatKurus: 0, countedKurus: 0 })).status).toBe(400);
    expect((await worker.get('/api/cash-closings/preview')).status).toBe(403);
  });
});

describe('"aracınız hazır" SMS', () => {
  beforeAll(async () => {
    await admin.patch('/api/settings', { smsEnabled: true, name: 'Parlak Oto Yıkama', smsReadyTemplate: 'Sayın {musteri}, {plaka} plakalı aracınız hazır. {isletme}' });
  });

  it('rızalı müşteri için HAZIR olunca kuyruğa yazılır; gönderilince SENT olur', async () => {
    const c = await customer({ name: 'Rızalı Müşteri', smsConsent: true });
    const wo = await order(c.id);
    await toReady(wo.id);
    const n = await prisma.notification.findUniqueOrThrow({ where: { workOrderId_kind: { workOrderId: wo.id, kind: 'READY' } } });
    expect(n.status).toBe('PENDING');
    expect(n.body).toBe(`Sayın Rızalı Müşteri, ${wo.vehicle.plate} plakalı aracınız hazır. Parlak Oto Yıkama`);

    const sent: string[] = [];
    const svc = new NotificationsService(app.get(PrismaService), { name: 'fake', send: async (to) => void sent.push(to) });
    await svc.processDue(500);
    expect(sent).toContain('5321234567');
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe('SENT');
    expect((await cashier.get(`/api/work-orders/${wo.id}`)).body.notifications[0].status).toBe('SENT');
  });

  it('rıza yoksa SMS kuyruğa yazılmaz', async () => {
    const c = await customer({ smsConsent: false });
    const wo = await order(c.id);
    await toReady(wo.id);
    expect(await prisma.notification.count({ where: { workOrderId: wo.id } })).toBe(0);
  });

  it('gönderim hatası durum değişikliğini bozmaz; yeniden denenir, 5. denemede FAILED olur', async () => {
    const c = await customer({ smsConsent: true });
    const wo = await order(c.id);
    await toReady(wo.id);
    const svc = new NotificationsService(app.get(PrismaService), {
      name: 'fail',
      send: async () => {
        throw new Error('servis yok');
      },
    });
    for (let i = 1; i <= 5; i++) {
      await prisma.notification.updateMany({ where: { workOrderId: wo.id }, data: { nextAttemptAt: new Date(0) } });
      await svc.processDue(500);
      const n = await prisma.notification.findFirstOrThrow({ where: { workOrderId: wo.id } });
      expect(n.attempts).toBe(i);
      expect(n.status).toBe(i < 5 ? 'PENDING' : 'FAILED');
    }
    expect((await cashier.get(`/api/work-orders/${wo.id}`)).body.status).toBe('HAZIR');
  });

  it('personel bildirim bilgisini görmez', async () => {
    const c = await customer({ smsConsent: true });
    const wo = await order(c.id);
    await toReady(wo.id);
    expect((await worker.get(`/api/work-orders/${wo.id}`)).body.notifications).toBeUndefined();
  });
});

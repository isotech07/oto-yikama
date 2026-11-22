import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, loginAs, randomPlate } from './helpers';

const prisma = new PrismaClient();
let app: INestApplication;
let admin: Client, cashier: Client, worker: Client, otherWorker: Client;
let wash: { id: string }, wax: { id: string };

beforeAll(async () => {
  app = await createTestApp();
  admin = await loginAs(app, prisma, 'ADMIN');
  cashier = await loginAs(app, prisma, 'CASHIER');
  worker = await loginAs(app, prisma, 'WORKER');
  otherWorker = await loginAs(app, prisma, 'WORKER');
  wash = (await admin.post('/api/services', { name: 'WO Dış Yıkama', priceKurus: 25000, vatRateBp: 2000 })).body;
  wax = (await admin.post('/api/services', { name: 'WO Cila', priceKurus: 30000, vatRateBp: 2000 })).body;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function newOrder(extra: object = {}) {
  const res = await cashier.post('/api/work-orders', {
    plate: randomPlate(),
    items: [{ serviceId: wash.id }],
    assignedWorkerId: worker.user.id,
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body;
}
const pay = (c: Client, id: string, amountKurus: number, extra: object = {}) =>
  c.post(`/api/work-orders/${id}/payments`, { amountKurus, method: 'NAKIT', idempotencyKey: randomUUID(), ...extra });
const move = (c: Client, id: string, to: string) => c.post(`/api/work-orders/${id}/status`, { to });

describe('iş emri oluşturma', () => {
  it('plakadan aracı oluşturur, fiyatı kopyalar, toplamları hesaplar', async () => {
    const wo = await newOrder({ items: [{ serviceId: wash.id }, { serviceId: wax.id, quantity: 2 }] });
    expect(wo.status).toBe('BEKLIYOR');
    expect(wo.items.map((i: { unitPrice: number }) => i.unitPrice)).toEqual([25000, 30000]);
    expect(wo.totals).toEqual({ grossKurus: 85000, vatKurus: 14167, netKurus: 70833 });
    expect(wo.balanceKurus).toBe(85000);
    expect(wo.allowedNext).toEqual(['YIKANIYOR', 'CANCELLED']);
  });

  it('aynı plakaya ikinci açık iş emri 409 ve mevcut iş emri id\'si döner', async () => {
    const plate = randomPlate();
    const first = (await cashier.post('/api/work-orders', { plate, items: [{ serviceId: wash.id }] })).body;
    const second = await cashier.post('/api/work-orders', { plate: plate.toLowerCase(), items: [{ serviceId: wash.id }] });
    expect(second.status).toBe(409);
    expect(second.body.workOrderId).toBe(first.id);
  });

  it('eşzamanlı iki istekten yalnız biri başarılı olur', async () => {
    const plate = randomPlate();
    const body = { plate, items: [{ serviceId: wash.id }] };
    const results = await Promise.all([cashier.post('/api/work-orders', body), cashier.post('/api/work-orders', body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('pasif hizmet ve personel olmayan atama reddedilir', async () => {
    const off = (await admin.post('/api/services', { name: 'Kapalı', priceKurus: 100, isActive: false })).body;
    expect((await cashier.post('/api/work-orders', { plate: randomPlate(), items: [{ serviceId: off.id }] })).status).toBe(400);
    expect(
      (await cashier.post('/api/work-orders', { plate: randomPlate(), items: [{ serviceId: wash.id }], assignedWorkerId: cashier.user.id })).status,
    ).toBe(400);
  });

  it('personel iş emri açamaz', async () => {
    expect((await worker.post('/api/work-orders', { plate: randomPlate(), items: [{ serviceId: wash.id }] })).status).toBe(403);
  });
});

describe('durum geçişleri', () => {
  it('tam akış: personel yıkar, kasiyer tahsil eder ve teslim eder', async () => {
    const wo = await newOrder();
    expect((await move(worker, wo.id, 'YIKANIYOR')).body.status).toBe('YIKANIYOR');
    expect((await move(worker, wo.id, 'KURULANIYOR')).body.status).toBe('KURULANIYOR');
    expect((await move(worker, wo.id, 'HAZIR')).body.status).toBe('HAZIR');

    expect((await move(worker, wo.id, 'TESLIM_EDILDI')).status).toBe(403); // teslim kasaya ait
    const unpaid = await move(cashier, wo.id, 'TESLIM_EDILDI');
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.message).toMatch(/Ödeme tamamlanmadan/);

    expect((await pay(cashier, wo.id, 25000)).body.balanceKurus).toBe(0);
    const done = await move(cashier, wo.id, 'TESLIM_EDILDI');
    expect(done.status).toBe(201);
    expect(done.body.status).toBe('TESLIM_EDILDI');
    expect(done.body.deliveredAt).not.toBeNull();

    const logs = await prisma.workOrderStatusLog.findMany({ where: { workOrderId: wo.id }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.toStatus)).toEqual(['BEKLIYOR', 'YIKANIYOR', 'KURULANIYOR', 'HAZIR', 'TESLIM_EDILDI']);
  });

  it('atlama yapılamaz: BEKLIYOR -> HAZIR 409', async () => {
    const wo = await newOrder();
    expect((await move(cashier, wo.id, 'HAZIR')).status).toBe(409);
  });

  it('KURULANIYOR iptal edilemez', async () => {
    const wo = await newOrder();
    await move(cashier, wo.id, 'YIKANIYOR');
    await move(cashier, wo.id, 'KURULANIYOR');
    expect((await move(cashier, wo.id, 'CANCELLED')).status).toBe(409);
  });

  it('başka personelin iş emri: görülemez ve güncellenemez (404)', async () => {
    const wo = await newOrder();
    expect((await otherWorker.get(`/api/work-orders/${wo.id}`)).status).toBe(404);
    expect((await move(otherWorker, wo.id, 'YIKANIYOR')).status).toBe(404);
    const list = await otherWorker.get('/api/work-orders');
    expect(list.body.items.some((x: { id: string }) => x.id === wo.id)).toBe(false);
  });

  it('personel iptal edemez, müşteri telefonu ve ödeme bilgisini görmez', async () => {
    const c = (await cashier.post('/api/customers', { name: 'Gizli Müşteri', phone: '05321234567' })).body;
    const wo = await newOrder({ customerId: c.id });
    expect((await move(worker, wo.id, 'CANCELLED')).status).toBe(403);
    const seen = (await worker.get(`/api/work-orders/${wo.id}`)).body;
    expect(seen.customer.name).toBe('Gizli Müşteri');
    expect(seen.customer.phone).toBeNull();
    expect(seen.paidKurus).toBeNull();
    expect(seen.payments).toBeUndefined();
  });

  it('teslim/iptal sonrası aynı plakaya yeni iş emri açılabilir', async () => {
    const plate = randomPlate();
    const wo = (await cashier.post('/api/work-orders', { plate, items: [{ serviceId: wash.id }] })).body;
    await move(cashier, wo.id, 'CANCELLED');
    expect((await cashier.post('/api/work-orders', { plate, items: [{ serviceId: wash.id }] })).status).toBe(201);
  });
});

describe('tahsilat ve iade', () => {
  it('bakiyeyi aşan tahsilat 409, parçalı ödeme olur', async () => {
    const wo = await newOrder();
    expect((await pay(cashier, wo.id, 25001)).status).toBe(409);
    expect((await pay(cashier, wo.id, 10000)).body.balanceKurus).toBe(15000);
    expect((await pay(cashier, wo.id, 15000, { method: 'KART' })).body.balanceKurus).toBe(0);
  });

  it('aynı işlem anahtarı iki kez gönderilirse tek ödeme kaydedilir', async () => {
    const wo = await newOrder();
    const key = randomUUID();
    const [a, b] = await Promise.all([pay(cashier, wo.id, 5000, { idempotencyKey: key }), pay(cashier, wo.id, 5000, { idempotencyKey: key })]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await prisma.payment.count({ where: { workOrderId: wo.id } })).toBe(1);
  });

  it('tahsilat iş emri satırını kilitler: başka transaction kilit tutarken bekler, sonra bakiyeyi doğru görür', async () => {
    const wo = await newOrder();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    // Kilidi tutan "diğer kasa": 20.000 ödeme yazar, 400 ms bekler, sonra commit eder.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${wo.id}::uuid FOR UPDATE`;
      await tx.payment.create({ data: { workOrderId: wo.id, amountKurus: 20000, method: 'NAKIT', receivedById: cashier.user.id } });
      locked();
      await sleep(400);
    });
    await lockTaken;
    const t0 = Date.now();
    const res = await pay(cashier, wo.id, 20000);
    await holder;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300); // kilit beklendi
    expect(res.status).toBe(409); // commit edilen 20.000 görüldü; kalan 5.000
    expect(res.body.message).toMatch(/bakiyeyi aşamaz/);
  });

  it('iade yalnız yönetici, açıklama zorunlu, tahsilatı aşamaz', async () => {
    const wo = await newOrder();
    await pay(cashier, wo.id, 25000);
    expect((await pay(cashier, wo.id, -5000, { note: 'şikayet' })).status).toBe(403);
    expect((await pay(admin, wo.id, -5000)).status).toBe(400);
    expect((await pay(admin, wo.id, -30000, { note: 'fazla' })).status).toBe(409);
    expect((await pay(admin, wo.id, -25000, { note: 'Müşteri vazgeçti' })).body.paidKurus).toBe(0);
    expect((await move(cashier, wo.id, 'CANCELLED')).status).toBe(201);
  });

  it('tahsilatı olan iş emri iptal edilemez', async () => {
    const wo = await newOrder();
    await pay(cashier, wo.id, 1000);
    expect((await move(cashier, wo.id, 'CANCELLED')).status).toBe(409);
  });

  it('iptal edilmiş iş emrine tahsilat yapılamaz', async () => {
    const wo = await newOrder();
    await move(cashier, wo.id, 'CANCELLED');
    expect((await pay(cashier, wo.id, 1000)).status).toBe(409);
  });
});

describe('kalemler ve atama', () => {
  it('kalem eklenir; ödenmiş tutarın altına düşürecek çıkarma reddedilir', async () => {
    const wo = await newOrder();
    const added = (await cashier.post(`/api/work-orders/${wo.id}/items`, { items: [{ serviceId: wax.id }] })).body;
    expect(added.totals.grossKurus).toBe(55000);
    await pay(cashier, wo.id, 50000);
    const waxItem = added.items.find((i: { serviceName: string }) => i.serviceName === 'WO Cila');
    expect((await cashier.delete(`/api/work-orders/${wo.id}/items/${waxItem.id}`)).status).toBe(409);
  });

  it('kalem çıkarma soft delete yapar; son kalem çıkarılamaz', async () => {
    const wo = await newOrder({ items: [{ serviceId: wash.id }, { serviceId: wax.id }] });
    const r = await cashier.delete(`/api/work-orders/${wo.id}/items/${wo.items[1].id}`);
    expect(r.body.items).toHaveLength(1);
    expect((await prisma.workOrderItem.findUnique({ where: { id: wo.items[1].id } }))?.deletedAt).not.toBeNull();
    expect((await cashier.delete(`/api/work-orders/${wo.id}/items/${wo.items[0].id}`)).status).toBe(400);
  });

  it('teslim edilmiş iş emrine kalem eklenemez', async () => {
    const wo = await newOrder();
    for (const s of ['YIKANIYOR', 'KURULANIYOR', 'HAZIR']) await move(cashier, wo.id, s);
    await pay(cashier, wo.id, 25000);
    await move(cashier, wo.id, 'TESLIM_EDILDI');
    expect((await cashier.post(`/api/work-orders/${wo.id}/items`, { items: [{ serviceId: wax.id }] })).status).toBe(409);
  });

  it('atama değişince eski personel erişimini kaybeder', async () => {
    const wo = await newOrder();
    await cashier.patch(`/api/work-orders/${wo.id}/assign`, { workerId: otherWorker.user.id });
    expect((await worker.get(`/api/work-orders/${wo.id}`)).status).toBe(404);
    expect((await move(otherWorker, wo.id, 'YIKANIYOR')).status).toBe(201);
  });
});

describe('raporlar', () => {
  it('yalnız yönetici; ödeme ve teslim toplamları tutarlı', async () => {
    expect((await cashier.get('/api/reports/summary')).status).toBe(403);
    const before = (await admin.get('/api/reports/summary')).body;
    const wo = await newOrder();
    for (const s of ['YIKANIYOR', 'KURULANIYOR', 'HAZIR']) await move(cashier, wo.id, s);
    await pay(cashier, wo.id, 25000, { method: 'KART' });
    await move(cashier, wo.id, 'TESLIM_EDILDI');
    const after = (await admin.get('/api/reports/summary')).body;
    expect(after.payments.byMethod.KART - before.payments.byMethod.KART).toBe(25000);
    expect(after.workOrders.delivered - before.workOrders.delivered).toBe(1);
    expect(after.revenue.grossKurus - before.revenue.grossKurus).toBe(25000);
    expect(after.revenue.vatKurus - before.revenue.vatKurus).toBe(4167); // domain/money ile aynı yuvarlama
  });

  it('geçersiz aralık 400', async () => {
    expect((await admin.get('/api/reports/summary?from=2026-11-10&to=2026-11-01')).status).toBe(400);
  });
});

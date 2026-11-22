import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, loginAs, randomPlate } from './helpers';

const prisma = new PrismaClient();
let app: INestApplication;
let admin: Client, cashier: Client, worker: Client;

beforeAll(async () => {
  app = await createTestApp();
  admin = await loginAs(app, prisma, 'ADMIN');
  cashier = await loginAs(app, prisma, 'CASHIER');
  worker = await loginAs(app, prisma, 'WORKER');
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('müşteriler', () => {
  it('kasiyer müşteri oluşturur; telefon normalize edilir', async () => {
    const res = await cashier.post('/api/customers', { name: 'Ali Veli', phone: '0532 111 22 33' });
    expect(res.status).toBe(201);
    expect(res.body.phone).toBe('5321112233');
  });

  it('geçersiz telefon 400', async () => {
    const res = await cashier.post('/api/customers', { name: 'Ali', phone: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/telefon/);
  });

  it('personel müşteri listesine erişemez', async () => {
    expect((await worker.get('/api/customers')).status).toBe(403);
    expect((await worker.post('/api/customers', { name: 'X Y' })).status).toBe(403);
  });

  it('ad, telefon ve plaka ile aranır', async () => {
    const name = `Arama ${Date.now()}`;
    const c = (await cashier.post('/api/customers', { name, phone: '0533 999 88 77' })).body;
    const plate = randomPlate();
    await cashier.post('/api/vehicles', { plate, customerId: c.id });
    for (const q of [name, '0533 999', plate]) {
      const res = await cashier.get(`/api/customers?q=${encodeURIComponent(q)}`);
      expect(res.body.items.map((x: { id: string }) => x.id)).toContain(c.id);
    }
  });

  it('silme yalnız yöneticide; soft delete sonrası bulunamaz ama DB\'de durur', async () => {
    const c = (await cashier.post('/api/customers', { name: 'Silinecek Kişi' })).body;
    expect((await cashier.delete(`/api/customers/${c.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/customers/${c.id}`)).status).toBe(204);
    expect((await cashier.get(`/api/customers/${c.id}`)).status).toBe(404);
    expect((await prisma.customer.findUnique({ where: { id: c.id } }))?.deletedAt).not.toBeNull();
  });

  it('geçersiz id 400', async () => {
    expect((await cashier.get('/api/customers/abc')).status).toBe(400);
  });
});

describe('araçlar', () => {
  it('plaka normalize edilerek kaydedilir, tekrar kaydı 409', async () => {
    const raw = randomPlate();
    const spaced = raw.slice(0, 3) + ' ' + raw.slice(3).toLowerCase();
    const res = await cashier.post('/api/vehicles', { plate: spaced, brand: 'Fiat' });
    expect(res.status).toBe(201);
    expect(res.body.plate).toBe(raw);
    expect((await cashier.post('/api/vehicles', { plate: raw })).status).toBe(409);
  });

  it('lookup: kayıtsız plaka vehicle null döner', async () => {
    const res = await cashier.get(`/api/vehicles/lookup?plate=${randomPlate()}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle).toBeNull();
  });

  it('geçersiz plaka 400', async () => {
    expect((await cashier.post('/api/vehicles', { plate: '!!' })).status).toBe(400);
  });
});

describe('hizmetler', () => {
  it('yalnız yönetici oluşturur/günceller', async () => {
    expect((await cashier.post('/api/services', { name: 'Kasiyer Hizmeti', priceKurus: 100 })).status).toBe(403);
    const s = await admin.post('/api/services', { name: 'Yeni Hizmet', priceKurus: 12550, vatRateBp: 2000 });
    expect(s.status).toBe(201);
    const u = await admin.patch(`/api/services/${s.body.id}`, { priceKurus: 15000 });
    expect(u.body.priceKurus).toBe(15000);
  });

  it('kuruş dışı (ondalık) tutar reddedilir', async () => {
    expect((await admin.post('/api/services', { name: 'Ondalık', priceKurus: 125.5 })).status).toBe(400);
  });

  it('pasif hizmet kasiyer listesinde görünmez, yönetici includeInactive ile görür', async () => {
    const s = (await admin.post('/api/services', { name: `Pasif ${Date.now()}`, priceKurus: 100, isActive: false })).body;
    const ids = (r: { body: { id: string }[] }) => r.body.map((x) => x.id);
    expect(ids(await cashier.get('/api/services?includeInactive=true'))).not.toContain(s.id);
    expect(ids(await admin.get('/api/services?includeInactive=true'))).toContain(s.id);
  });
});

describe('kullanıcılar', () => {
  it('yönetici kullanıcı oluşturur; yanıt şifre hash\'i içermez', async () => {
    const res = await admin.post('/api/users', {
      email: `Yeni${Date.now()}@Test.local`,
      name: 'Yeni Personel',
      role: 'WORKER',
      password: 'GucluSifre1',
    });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(res.body.email.toLowerCase());
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it('kısa şifre 400, kasiyer kullanıcı listeleyemez', async () => {
    expect((await admin.post('/api/users', { email: 'k@t.local', name: 'Ab', role: 'WORKER', password: '123' })).status).toBe(400);
    expect((await cashier.get('/api/users')).status).toBe(403);
  });

  it('kasiyer personel listesini görür (atama için)', async () => {
    const res = await cashier.get('/api/users/workers');
    expect(res.status).toBe(200);
    expect(res.body.some((w: { id: string }) => w.id === worker.user.id)).toBe(true);
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name']);
  });

  it('yönetici kendini pasife alamaz', async () => {
    expect((await admin.patch(`/api/users/${admin.user.id}`, { isActive: false })).status).toBe(400);
  });

  it('şifre değişince kullanıcının oturumları kapanır', async () => {
    const victim = await loginAs(app, prisma, 'CASHIER');
    expect((await victim.get('/api/auth/me')).status).toBe(200);
    expect((await admin.patch(`/api/users/${victim.user.id}`, { password: 'YeniSifre123' })).status).toBe(200);
    expect((await victim.get('/api/auth/me')).status).toBe(401);
  });
});

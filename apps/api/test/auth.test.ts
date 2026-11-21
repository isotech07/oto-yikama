import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { Roles } from '../src/auth/decorators';
import { SESSION_COOKIE } from '../src/auth/auth.types';
import { setupApp } from '../src/setup-app';
import { createUser } from './helpers';

// Yalnızca testte kullanılan endpoint'ler: guard davranışını doğrulamak için.
@Controller('test-guard')
class GuardProbeController {
  @Get('no-roles') // @Roles unutulmuş endpoint -> 403 olmalı
  noRoles() {
    return { leaked: true };
  }
  @Roles('ADMIN')
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }
}

const prisma = new PrismaClient();
let app: INestApplication;

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[];
  const c = raw.find((x) => x.startsWith(`${SESSION_COOKIE}=`));
  if (!c) throw new Error('session çerezi yok');
  return c.split(';')[0];
}

async function login(email: string, password: string) {
  return request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [GuardProbeController],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  setupApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('doğru bilgilerle httpOnly çerez döner, şifre hash\'i dönmez', async () => {
    const { email, password, user } = await createUser(prisma, 'CASHIER');
    const res = await login(email.toUpperCase(), password); // e-posta büyük/küçük harf duyarsız
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: user.id, email, name: user.name, role: 'CASHIER' });
    expect(JSON.stringify(res.body)).not.toContain('password');
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it('DB\'de ham token değil özeti saklanır', async () => {
    const { email, password, user } = await createUser(prisma, 'WORKER');
    const res = await login(email, password);
    const token = sessionCookie(res).split('=')[1];
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).not.toBe(token);
    expect(sessions[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('yanlış şifre ve olmayan kullanıcı aynı yanıtı alır', async () => {
    const { email } = await createUser(prisma, 'ADMIN');
    const wrong = await login(email, 'yanlis-sifre');
    const missing = await login('yok@test.local', 'herhangi');
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.message).toBe(missing.body.message);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('pasif kullanıcı giriş yapamaz', async () => {
    const { email, password } = await createUser(prisma, 'CASHIER', { isActive: false });
    expect((await login(email, password)).status).toBe(401);
  });

  it('hız sınırı aşılınca 429', async () => {
    const prev = process.env.LOGIN_RATE_LIMIT;
    process.env.LOGIN_RATE_LIMIT = '0';
    try {
      // Ayrı istemci IP'si: blok diğer testleri etkilemesin.
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ email: 'kimse@test.local', password: 'x' });
      expect(res.status).toBe(429);
    } finally {
      process.env.LOGIN_RATE_LIMIT = prev;
    }
  });

  it('geçersiz gövde 400 döner', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('oturum ve yetki', () => {
  it('çerezsiz /me 401', async () => {
    expect((await request(app.getHttpServer()).get('/api/auth/me')).status).toBe(401);
  });

  it('sahte token 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=sahte`);
    expect(res.status).toBe(401);
  });

  it('girişten sonra /me kullanıcıyı döner; çıkıştan sonra aynı çerez geçersiz', async () => {
    const { email, password } = await createUser(prisma, 'WORKER');
    const cookie = sessionCookie(await login(email, password));
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('WORKER');

    expect((await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('kullanıcı pasife alınınca mevcut oturumu anında düşer', async () => {
    const { email, password, user } = await createUser(prisma, 'CASHIER');
    const cookie = sessionCookie(await login(email, password));
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('süresi dolmuş oturum 401', async () => {
    const { email, password, user } = await createUser(prisma, 'CASHIER');
    const cookie = sessionCookie(await login(email, password));
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('@Roles tanımlanmamış endpoint, ADMIN için bile 403 (varsayılan: reddet)', async () => {
    const { email, password } = await createUser(prisma, 'ADMIN');
    const cookie = sessionCookie(await login(email, password));
    const res = await request(app.getHttpServer()).get('/api/test-guard/no-roles').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.leaked).toBeUndefined();
  });

  it('rol yetkisi sunucuda uygulanır: ADMIN-only endpoint CASHIER/WORKER için 403', async () => {
    for (const role of ['CASHIER', 'WORKER'] as const) {
      const { email, password } = await createUser(prisma, role);
      const cookie = sessionCookie(await login(email, password));
      expect((await request(app.getHttpServer()).get('/api/test-guard/admin-only').set('Cookie', cookie)).status).toBe(403);
    }
    const { email, password } = await createUser(prisma, 'ADMIN');
    const cookie = sessionCookie(await login(email, password));
    expect((await request(app.getHttpServer()).get('/api/test-guard/admin-only').set('Cookie', cookie)).status).toBe(200);
  });

  it('health endpoint public', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

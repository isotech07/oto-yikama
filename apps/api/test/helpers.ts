import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app);
  await app.init();
  return app;
}

let counter = 0;
export async function createUser(prisma: PrismaClient, role: Role, opts: { password?: string; isActive?: boolean } = {}) {
  const password = opts.password ?? 'Sifre123!';
  const email = `${role.toLowerCase()}-${Date.now()}-${++counter}@test.local`;
  const user = await prisma.user.create({
    data: { email, name: `Test ${role}`, role, isActive: opts.isActive ?? true, passwordHash: await bcrypt.hash(password, 4) },
  });
  return { user, email, password };
}

/** Test için benzersiz, geçerli formatta plaka. */
export function randomPlate(): string {
  const n = Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
  return `T${n}`;
}

import request from 'supertest';
import { SESSION_COOKIE } from '../src/auth/auth.types';

/** Verilen rolde kullanıcı oluşturup giriş yapar; isteklerde kullanılacak çerez ve kullanıcıyı döner. */
export async function loginAs(app: INestApplication, prisma: PrismaClient, role: Role) {
  const { user, email, password } = await createUser(prisma, role);
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
  const raw = res.headers['set-cookie'] as unknown as string[];
  const cookie = raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0];
  const http = app.getHttpServer();
  const as = {
    get: (url: string) => request(http).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => request(http).post(url).set('Cookie', cookie).send(body ?? {}),
    patch: (url: string, body?: object) => request(http).patch(url).set('Cookie', cookie).send(body ?? {}),
    delete: (url: string) => request(http).delete(url).set('Cookie', cookie),
  };
  return { user, cookie, ...as };
}
export type Client = Awaited<ReturnType<typeof loginAs>>;

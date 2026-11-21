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

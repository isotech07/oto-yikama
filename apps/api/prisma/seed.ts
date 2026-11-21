import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const isProd = process.env.NODE_ENV === 'production';

async function upsertUser(email: string, name: string, role: 'ADMIN' | 'CASHIER' | 'WORKER', password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (isProd && (!adminEmail || !adminPassword)) {
    throw new Error('Üretimde SEED_ADMIN_EMAIL ve SEED_ADMIN_PASSWORD zorunlu');
  }
  await upsertUser(adminEmail || 'admin@otoyikama.local', 'Yönetici', 'ADMIN', adminPassword || 'Admin123!');

  if (!isProd) {
    await upsertUser('kasiyer@otoyikama.local', 'Ayşe Kasiyer', 'CASHIER', 'Kasiyer123!');
    await upsertUser('personel@otoyikama.local', 'Mehmet Personel', 'WORKER', 'Personel123!');

    if ((await prisma.service.count()) === 0) {
      await prisma.service.createMany({
        data: [
          { name: 'Dış Yıkama', priceKurus: 25000, vatRateBp: 2000 },
          { name: 'İç-Dış Yıkama', priceKurus: 45000, vatRateBp: 2000 },
          { name: 'Detaylı Temizlik', priceKurus: 150000, vatRateBp: 2000 },
          { name: 'Motor Yıkama', priceKurus: 30000, vatRateBp: 2000 },
          { name: 'Pasta Cila', priceKurus: 250000, vatRateBp: 2000 },
        ],
      });
    }
  }
  console.log('Seed tamamlandı');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

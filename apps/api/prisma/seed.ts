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

    if ((await prisma.workOrder.count()) === 0) await seedWorkOrders();
    if ((await prisma.package.count()) === 0) {
      const dis = await prisma.service.findFirst({ where: { name: 'Dış Yıkama' } });
      if (dis) await prisma.package.create({ data: { name: '10 Dış Yıkama', serviceId: dis.id, credits: 10, priceKurus: 225000, vatRateBp: 2000, validDays: 180 } });
    }
    await prisma.businessSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'Parlak Oto Yıkama', address: 'Atatürk Cad. No: 12, Kadıköy / İstanbul', phone: '0216 555 12 34' } });
  }
  console.log('Seed tamamlandı');
}

async function seedWorkOrders() {
  const cashier = await prisma.user.findUniqueOrThrow({ where: { email: 'kasiyer@otoyikama.local' } });
  const worker = await prisma.user.findUniqueOrThrow({ where: { email: 'personel@otoyikama.local' } });
  const services = await prisma.service.findMany({ orderBy: { priceKurus: 'asc' } });
  const sample: { name: string; phone: string; plate: string; brand: string; status: 'BEKLIYOR' | 'YIKANIYOR' | 'HAZIR'; svc: number[]; paid?: boolean }[] = [
    { name: 'Ahmet Yılmaz', phone: '5321112233', plate: '34ABC123', brand: 'Renault', status: 'BEKLIYOR', svc: [0] },
    { name: 'Zeynep Kaya', phone: '5334445566', plate: '06ZK2024', brand: 'Toyota', status: 'YIKANIYOR', svc: [1, 2] },
    { name: 'Mert Demir', phone: '5427778899', plate: '35MD777', brand: 'Volkswagen', status: 'HAZIR', svc: [2], paid: true },
  ];
  for (const s of sample) {
    const customer = await prisma.customer.create({ data: { name: s.name, phone: s.phone } });
    const vehicle = await prisma.vehicle.create({ data: { plate: s.plate, brand: s.brand, customerId: customer.id } });
    const items = s.svc.map((i) => services[i]);
    const wo = await prisma.workOrder.create({
      data: {
        vehicleId: vehicle.id,
        customerId: customer.id,
        status: s.status,
        assignedWorkerId: worker.id,
        createdById: cashier.id,
        items: { create: items.map((x) => ({ serviceId: x.id, serviceName: x.name, unitPrice: x.priceKurus, vatRateBp: x.vatRateBp })) },
        statusLogs: { create: { fromStatus: null, toStatus: 'BEKLIYOR', changedById: cashier.id } },
      },
    });
    if (s.paid) {
      const total = items.reduce((t, x) => t + x.priceKurus, 0);
      await prisma.payment.create({ data: { workOrderId: wo.id, amountKurus: total, method: 'KART', receivedById: cashier.id } });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

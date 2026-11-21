import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, randomPlate } from './helpers';

const prisma = new PrismaClient();
let cashierId: string;

beforeAll(async () => {
  cashierId = (await createUser(prisma, 'CASHIER')).user.id;
});
afterAll(() => prisma.$disconnect());

async function newVehicle(plate = randomPlate()) {
  return prisma.vehicle.create({ data: { plate } });
}
async function openOrder(vehicleId: string) {
  return prisma.workOrder.create({ data: { vehicleId, createdById: cashierId } });
}
function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

describe('plaka kısıtları', () => {
  it('normalize edilmemiş plaka reddedilir', async () => {
    await expect(prisma.vehicle.create({ data: { plate: '34 abc 123' } })).rejects.toThrow(/vehicles_plate_normalized_chk/);
  });

  it('aynı plaka iki kez kaydedilemez', async () => {
    const plate = randomPlate();
    await newVehicle(plate);
    await expect(newVehicle(plate)).rejects.toSatisfy(isUniqueViolation);
  });

  it('soft-delete edilmiş plakayla yeni kayıt açılabilir', async () => {
    const plate = randomPlate();
    const v = await newVehicle(plate);
    await prisma.vehicle.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
    await expect(newVehicle(plate)).resolves.toBeTruthy();
  });
});

describe('açık iş emri kısıtı', () => {
  it('aynı araca ikinci açık iş emri açılamaz', async () => {
    const v = await newVehicle();
    await openOrder(v.id);
    await expect(openOrder(v.id)).rejects.toSatisfy(isUniqueViolation);
  });

  it('önceki iş emri teslim edildiyse yenisi açılabilir', async () => {
    const v = await newVehicle();
    const wo = await openOrder(v.id);
    await prisma.workOrder.update({ where: { id: wo.id }, data: { status: 'TESLIM_EDILDI', deliveredAt: new Date() } });
    await expect(openOrder(v.id)).resolves.toBeTruthy();
  });

  it('önceki iş emri iptal edildiyse yenisi açılabilir', async () => {
    const v = await newVehicle();
    const wo = await openOrder(v.id);
    await prisma.workOrder.update({ where: { id: wo.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await expect(openOrder(v.id)).resolves.toBeTruthy();
  });

  it('teslim durumu delivered_at olmadan yazılamaz', async () => {
    const v = await newVehicle();
    const wo = await openOrder(v.id);
    await expect(
      prisma.workOrder.update({ where: { id: wo.id }, data: { status: 'TESLIM_EDILDI' } }),
    ).rejects.toThrow(/work_orders_delivered_chk/);
  });
});

describe('ödemeler', () => {
  async function newPayment() {
    const v = await newVehicle();
    const wo = await openOrder(v.id);
    return prisma.payment.create({
      data: { workOrderId: wo.id, amountKurus: 25000, method: 'NAKIT', receivedById: cashierId },
    });
  }

  it('ödeme silinemez', async () => {
    const p = await newPayment();
    await expect(prisma.payment.delete({ where: { id: p.id } })).rejects.toThrow(/silinemez/);
    expect(await prisma.payment.findUnique({ where: { id: p.id } })).not.toBeNull();
  });

  it('ödeme değiştirilemez', async () => {
    const p = await newPayment();
    await expect(prisma.payment.update({ where: { id: p.id }, data: { amountKurus: 1 } })).rejects.toThrow(/değiştirilemez/);
  });

  it('sıfır tutarlı ödeme reddedilir', async () => {
    const v = await newVehicle();
    const wo = await openOrder(v.id);
    await expect(
      prisma.payment.create({ data: { workOrderId: wo.id, amountKurus: 0, method: 'KART', receivedById: cashierId } }),
    ).rejects.toThrow(/payments_amount_chk/);
  });
});

describe('fiyat kopyalama', () => {
  it('hizmet fiyatı değişince mevcut iş emri kalemi etkilenmez', async () => {
    const service = await prisma.service.create({ data: { name: 'Test Yıkama', priceKurus: 25000, vatRateBp: 2000 } });
    const v = await newVehicle();
    const wo = await openOrder(v.id);
    const item = await prisma.workOrderItem.create({
      data: {
        workOrderId: wo.id,
        serviceId: service.id,
        serviceName: service.name,
        unitPrice: service.priceKurus,
        vatRateBp: service.vatRateBp,
      },
    });
    await prisma.service.update({ where: { id: service.id }, data: { priceKurus: 30000, name: 'Yeni Ad' } });
    const after = await prisma.workOrderItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.unitPrice).toBe(25000);
    expect(after.serviceName).toBe('Test Yıkama');
  });

  it('negatif fiyat reddedilir', async () => {
    await expect(prisma.service.create({ data: { name: 'X', priceKurus: -1, vatRateBp: 2000 } })).rejects.toThrow(
      /services_price_chk/,
    );
  });
});

describe('kullanıcı', () => {
  it('büyük harfli e-posta DB seviyesinde reddedilir', async () => {
    await expect(
      prisma.user.create({ data: { email: 'Buyuk@Test.local', name: 'x', role: 'ADMIN', passwordHash: 'x' } }),
    ).rejects.toThrow(/users_email_lower_chk/);
  });
});

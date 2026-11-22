import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { IdParam, optionalText } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { normalizePlate } from '../domain/plate';
import { OPEN_STATUSES } from '../domain/work-order-status';
import { PrismaService } from '../prisma/prisma.service';

export const plateField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePlate(v);
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçerli bir plaka girin (ör. 34 ABC 123)' });
      return z.NEVER;
    }
    return p;
  });

const CreateVehicle = z.object({
  plate: plateField,
  customerId: z.string().uuid().nullish(),
  brand: optionalText(60),
  model: optionalText(60),
  color: optionalText(30),
});
const UpdateVehicle = CreateVehicle.partial();
const LookupQuery = z.object({ plate: plateField });

const select = {
  id: true,
  plate: true,
  brand: true,
  model: true,
  color: true,
  customer: { select: { id: true, name: true, phone: true } },
} as const;

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Plaka ile hızlı arama: araç, sahibi ve varsa açık iş emri. Kayıt yoksa vehicle: null. */
  @Roles('ADMIN', 'CASHIER')
  @Get('lookup')
  async lookup(@Query(new ZodPipe(LookupQuery)) q: z.infer<typeof LookupQuery>) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { plate: q.plate, deletedAt: null }, select });
    if (!vehicle) return { plate: q.plate, vehicle: null, openWorkOrder: null };
    const openWorkOrder = await this.prisma.workOrder.findFirst({
      where: { vehicleId: vehicle.id, deletedAt: null, status: { in: [...OPEN_STATUSES] } },
      select: { id: true, status: true, createdAt: true },
    });
    return { plate: q.plate, vehicle, openWorkOrder };
  }

  @Roles('ADMIN', 'CASHIER')
  @Get(':id')
  async get(@IdParam() id: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...select,
        workOrders: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, status: true, createdAt: true },
        },
      },
    });
    if (!v) throw new NotFoundException('Araç bulunamadı');
    return v;
  }

  @Roles('ADMIN', 'CASHIER')
  @Post()
  async create(@Body(new ZodPipe(CreateVehicle)) body: z.infer<typeof CreateVehicle>) {
    await this.assertCustomer(body.customerId);
    const exists = await this.prisma.vehicle.findFirst({ where: { plate: body.plate, deletedAt: null }, select: { id: true } });
    if (exists) throw new ConflictException('Bu plaka zaten kayıtlı');
    return this.prisma.vehicle.create({ data: body, select });
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch(':id')
  async update(@IdParam() id: string, @Body(new ZodPipe(UpdateVehicle)) body: z.infer<typeof UpdateVehicle>) {
    if (Object.keys(body).length === 0) throw new BadRequestException('Değişiklik yok');
    await this.assertCustomer(body.customerId);
    if (body.plate) {
      const other = await this.prisma.vehicle.findFirst({
        where: { plate: body.plate, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (other) throw new ConflictException('Bu plaka başka bir araçta kayıtlı');
    }
    const r = await this.prisma.vehicle.updateMany({ where: { id, deletedAt: null }, data: body });
    if (r.count === 0) throw new NotFoundException('Araç bulunamadı');
    return this.get(id);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@IdParam() id: string) {
    const open = await this.prisma.workOrder.count({
      where: { vehicleId: id, deletedAt: null, status: { in: [...OPEN_STATUSES] } },
    });
    if (open > 0) throw new ConflictException('Açık iş emri olan araç silinemez');
    const r = await this.prisma.vehicle.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count === 0) throw new NotFoundException('Araç bulunamadı');
  }

  private async assertCustomer(customerId: string | null | undefined) {
    if (!customerId) return;
    const c = await this.prisma.customer.count({ where: { id: customerId, deletedAt: null } });
    if (!c) throw new BadRequestException('Müşteri bulunamadı');
  }
}

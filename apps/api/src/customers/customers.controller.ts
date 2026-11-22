import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { CurrentUserInfo } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { customerPackageSelect } from '../packages/packages.controller';
import { customerOutstanding } from '../work-orders/receivables';
import { IdParam, optionalText, PageQuery } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { normalizePhone } from '../domain/phone';
import { PrismaService } from '../prisma/prisma.service';

const phoneField = z
  .string()
  .trim()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçerli bir telefon numarası girin' });
      return z.NEVER;
    }
    return p;
  });

const CreateCustomer = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(120),
  phone: phoneField,
  smsConsent: z.boolean().optional(),
  // Veresiye alanlarını yalnız yönetici değiştirebilir (aşağıda kontrol).
  creditAllowed: z.boolean().optional(),
  creditLimitKurus: z.number().int().min(0).max(100_000_000).nullish(),
});
const UpdateCustomer = CreateCustomer.partial();

type CustomerInput = z.infer<typeof UpdateCustomer>;

function toData(body: CustomerInput, user: CurrentUserInfo) {
  if (user.role !== 'ADMIN' && (body.creditAllowed !== undefined || body.creditLimitKurus !== undefined)) {
    throw new ForbiddenException('Veresiye ayarlarını yalnız yönetici değiştirebilir');
  }
  const { smsConsent, ...rest } = body;
  return {
    ...rest,
    ...(smsConsent !== undefined ? { smsConsent, smsConsentAt: smsConsent ? new Date() : null } : {}),
  };
}
const ListQuery = PageQuery.extend({ q: optionalText(60) });

const vehicleSelect = { id: true, plate: true, brand: true, model: true, color: true } as const;

@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN', 'CASHIER')
  @Get()
  async list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^0/, '') } }] : []),
        { vehicles: { some: { deletedAt: null, plate: { contains: q.q.toUpperCase().replace(/[\s\-.]/g, '') } } } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, name: true, phone: true, createdAt: true, vehicles: { where: { deletedAt: null }, select: vehicleSelect } },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Roles('ADMIN', 'CASHIER')
  @Get(':id')
  async get(@IdParam() id: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        smsConsent: true,
        creditAllowed: true,
        creditLimitKurus: true,
        createdAt: true,
        customerPackages: { orderBy: { createdAt: 'desc' }, select: customerPackageSelect },
        vehicles: { where: { deletedAt: null }, select: vehicleSelect, orderBy: { createdAt: 'asc' } },
        workOrders: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, status: true, createdAt: true, vehicle: { select: { plate: true } } },
        },
      },
    });
    if (!c) throw new NotFoundException('Müşteri bulunamadı');
    const { customerPackages, ...rest } = c;
    return { ...rest, packages: customerPackages, outstandingKurus: await customerOutstanding(this.prisma, id) };
  }

  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@Body(new ZodPipe(CreateCustomer)) body: z.infer<typeof CreateCustomer>, @CurrentUser() user: CurrentUserInfo) {
    return this.prisma.customer.create({ data: { ...toData(body, user), name: body.name }, select: { id: true, name: true, phone: true } });
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch(':id')
  async update(
    @IdParam() id: string,
    @Body(new ZodPipe(UpdateCustomer)) body: z.infer<typeof UpdateCustomer>,
    @CurrentUser() user: CurrentUserInfo,
  ) {
    if (Object.keys(body).length === 0) throw new BadRequestException('Değişiklik yok');
    const r = await this.prisma.customer.updateMany({ where: { id, deletedAt: null }, data: toData(body, user) });
    if (r.count === 0) throw new NotFoundException('Müşteri bulunamadı');
    return this.get(id);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@IdParam() id: string) {
    const r = await this.prisma.customer.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count === 0) throw new NotFoundException('Müşteri bulunamadı');
  }
}

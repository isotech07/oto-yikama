import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { CurrentUserInfo } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { lockCashDay, isDayClosed } from '../cash/cash-lock';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const CreatePackage = z.object({
  name: z.string().trim().min(2).max(80),
  serviceId: z.string().uuid(),
  credits: z.number().int().min(1).max(1000),
  priceKurus: z.number().int().min(0).max(100_000_000),
  vatRateBp: z.number().int().min(0).max(10000).default(2000),
  validDays: z.number().int().min(1).max(3650).nullish(),
  isActive: z.boolean().default(true),
});
const UpdatePackage = CreatePackage.partial().omit({ serviceId: true, credits: true });
const ListQuery = z.object({ includeInactive: z.enum(['true', 'false']).default('false') });
const SellBody = z.object({
  packageId: z.string().uuid(),
  method: z.enum(['NAKIT', 'KART', 'HAVALE']),
  idempotencyKey: z.string().uuid(),
});

const select = {
  id: true,
  name: true,
  credits: true,
  priceKurus: true,
  vatRateBp: true,
  validDays: true,
  isActive: true,
  service: { select: { id: true, name: true } },
} as const;

export const customerPackageSelect = {
  id: true,
  name: true,
  serviceId: true,
  totalCredits: true,
  remainingCredits: true,
  priceKurus: true,
  expiresAt: true,
  createdAt: true,
} as const;

@Controller()
export class PackagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN', 'CASHIER')
  @Get('packages')
  list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>, @CurrentUser() user: CurrentUserInfo) {
    const all = q.includeInactive === 'true' && user.role === 'ADMIN';
    return this.prisma.package.findMany({ where: { deletedAt: null, ...(all ? {} : { isActive: true }) }, orderBy: { name: 'asc' }, select });
  }

  @Roles('ADMIN')
  @Post('packages')
  async create(@Body(new ZodPipe(CreatePackage)) b: z.infer<typeof CreatePackage>) {
    const s = await this.prisma.service.count({ where: { id: b.serviceId, deletedAt: null } });
    if (!s) throw new BadRequestException('Hizmet bulunamadı');
    return this.prisma.package.create({ data: b, select });
  }

  /** Hizmet ve kredi sayısı değiştirilemez (satılmış paketlerle karışmasın); gerekirse yeni paket açılır. */
  @Roles('ADMIN')
  @Patch('packages/:id')
  async update(@IdParam() id: string, @Body(new ZodPipe(UpdatePackage)) b: z.infer<typeof UpdatePackage>) {
    const r = await this.prisma.package.updateMany({ where: { id, deletedAt: null }, data: b });
    if (!r.count) throw new NotFoundException('Paket bulunamadı');
    return this.prisma.package.findUniqueOrThrow({ where: { id }, select });
  }

  @Roles('ADMIN')
  @Delete('packages/:id')
  @HttpCode(204)
  async remove(@IdParam() id: string) {
    const r = await this.prisma.package.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (!r.count) throw new NotFoundException('Paket bulunamadı');
  }

  @Roles('ADMIN', 'CASHIER')
  @Get('customers/:id/packages')
  customerPackages(@IdParam() id: string) {
    return this.prisma.customerPackage.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: customerPackageSelect });
  }

  /** Müşteriye paket satışı: paket kaydı ve tam ödeme aynı transaction'da. Aynı işlem anahtarı ikinci satış yapmaz. */
  @Roles('ADMIN', 'CASHIER')
  @Post('customers/:id/packages')
  async sell(@IdParam() customerId: string, @CurrentUser() user: CurrentUserInfo, @Body(new ZodPipe(SellBody)) b: z.infer<typeof SellBody>) {
    const replay = await this.prisma.payment.findUnique({ where: { idempotencyKey: b.idempotencyKey }, select: { customerPackageId: true } });
    if (replay) {
      if (!replay.customerPackageId) throw new ConflictException('Bu işlem anahtarı başka bir ödeme için kullanılmış');
      return this.prisma.customerPackage.findUniqueOrThrow({ where: { id: replay.customerPackageId }, select: customerPackageSelect });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.count({ where: { id: customerId, deletedAt: null } });
        if (!customer) throw new NotFoundException('Müşteri bulunamadı');
        const pkg = await tx.package.findFirst({ where: { id: b.packageId, deletedAt: null, isActive: true } });
        if (!pkg) throw new BadRequestException('Paket bulunamadı veya satışta değil');
        if (b.method === 'NAKIT') {
          await lockCashDay(tx);
          if (await isDayClosed(tx)) throw new ConflictException('Bugünün kasası kapatıldı; nakit alınamaz');
        }
        const cp = await tx.customerPackage.create({
          data: {
            customerId,
            packageId: pkg.id,
            serviceId: pkg.serviceId,
            name: pkg.name,
            totalCredits: pkg.credits,
            remainingCredits: pkg.credits,
            priceKurus: pkg.priceKurus,
            vatRateBp: pkg.vatRateBp,
            expiresAt: pkg.validDays ? new Date(Date.now() + pkg.validDays * 86_400_000) : null,
            soldById: user.id,
          },
          select: customerPackageSelect,
        });
        if (pkg.priceKurus > 0) {
          await tx.payment.create({
            data: { customerPackageId: cp.id, amountKurus: pkg.priceKurus, method: b.method, idempotencyKey: b.idempotencyKey, receivedById: user.id },
          });
        }
        return cp;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const p = await this.prisma.payment.findUnique({ where: { idempotencyKey: b.idempotencyKey }, select: { customerPackageId: true } });
        if (p?.customerPackageId) return this.prisma.customerPackage.findUniqueOrThrow({ where: { id: p.customerPackageId }, select: customerPackageSelect });
      }
      throw e;
    }
  }
}

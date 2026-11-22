import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import type { CurrentUserInfo } from '../auth/auth.types';
import { IdParam } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const CreateService = z.object({
  name: z.string().trim().min(2).max(80),
  priceKurus: z.number().int('Tutar kuruş cinsinden tam sayı olmalı').min(0).max(100_000_000),
  vatRateBp: z.number().int().min(0).max(10000).default(2000),
  isActive: z.boolean().default(true),
});
const UpdateService = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  priceKurus: z.number().int().min(0).max(100_000_000).optional(),
  vatRateBp: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});
const ListQuery = z.object({ includeInactive: z.enum(['true', 'false']).default('false') });

const select = { id: true, name: true, priceKurus: true, vatRateBp: true, isActive: true } as const;

@Controller('services')
export class ServicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN', 'CASHIER')
  @Get()
  list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>, @CurrentUser() user: CurrentUserInfo) {
    const includeInactive = q.includeInactive === 'true' && user.role === 'ADMIN';
    return this.prisma.service.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
      select,
    });
  }

  @Roles('ADMIN')
  @Post()
  create(@Body(new ZodPipe(CreateService)) body: z.infer<typeof CreateService>) {
    return this.prisma.service.create({ data: body, select });
  }

  /** Fiyat değişikliği yalnızca yeni kalemleri etkiler; mevcut iş emri kalemleri kopyalanmış fiyatı korur. */
  @Roles('ADMIN')
  @Patch(':id')
  async update(@IdParam() id: string, @Body(new ZodPipe(UpdateService)) body: z.infer<typeof UpdateService>) {
    if (Object.keys(body).length === 0) throw new BadRequestException('Değişiklik yok');
    const r = await this.prisma.service.updateMany({ where: { id, deletedAt: null }, data: body });
    if (r.count === 0) throw new NotFoundException('Hizmet bulunamadı');
    return this.prisma.service.findUniqueOrThrow({ where: { id }, select });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@IdParam() id: string) {
    const r = await this.prisma.service.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (r.count === 0) throw new NotFoundException('Hizmet bulunamadı');
  }
}

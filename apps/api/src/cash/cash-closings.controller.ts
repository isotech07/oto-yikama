import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { CurrentUserInfo } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { dateString, optionalText } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { trDate } from '../domain/time';
import { PrismaService } from '../prisma/prisma.service';
import { cashInForDay, lockCashDay } from './cash-lock';

const kurus = z.number().int('Tutar kuruş cinsinden tam sayı olmalı').min(0).max(100_000_000);
const CloseBody = z.object({
  date: dateString,
  openingFloatKurus: kurus,
  countedKurus: kurus,
  note: optionalText(500),
});
const DateQuery = z.object({ date: dateString.optional() });
const RangeQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

const select = {
  id: true,
  businessDate: true,
  openingFloatKurus: true,
  cashInKurus: true,
  expectedKurus: true,
  countedKurus: true,
  differenceKurus: true,
  note: true,
  createdAt: true,
  closedBy: { select: { id: true, name: true } },
} as const;

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

@Controller('cash-closings')
export class CashClosingsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Kapanış ekranı için: o günün nakit girişi ve (varsa) mevcut kapanış. */
  @Roles('ADMIN', 'CASHIER')
  @Get('preview')
  async preview(@Query(new ZodPipe(DateQuery)) q: z.infer<typeof DateQuery>) {
    const date = q.date ?? trDate();
    const [cashInKurus, closing] = await Promise.all([
      cashInForDay(this.prisma, date),
      this.prisma.cashClosing.findUnique({ where: { businessDate: asDate(date) }, select }),
    ]);
    return { date, cashInKurus, closing };
  }

  @Roles('ADMIN')
  @Get()
  list(@Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>) {
    return this.prisma.cashClosing.findMany({
      where: { businessDate: { gte: q.from ? asDate(q.from) : undefined, lte: q.to ? asDate(q.to) : undefined } },
      orderBy: { businessDate: 'desc' },
      take: 100,
      select,
    });
  }

  /**
   * Gün sonu kapanışı. Kasiyer yalnız bugünü, yönetici geçmiş günleri de kapatabilir. Gelecek gün kapatılamaz.
   * Kapanıştan sonra o güne nakit tahsilat alınamaz (bkz. WorkOrdersService.addPayment).
   */
  @Roles('ADMIN', 'CASHIER')
  @Post()
  async close(@CurrentUser() user: CurrentUserInfo, @Body(new ZodPipe(CloseBody)) b: z.infer<typeof CloseBody>) {
    const today = trDate();
    if (b.date > today) throw new BadRequestException('Gelecek tarihli kapanış yapılamaz');
    if (user.role === 'CASHIER' && b.date !== today) throw new ForbiddenException('Geçmiş günü yalnız yönetici kapatabilir');

    return this.prisma.$transaction(async (tx) => {
      await lockCashDay(tx, b.date);
      if (await tx.cashClosing.count({ where: { businessDate: asDate(b.date) } })) {
        throw new ConflictException('Bu gün zaten kapatılmış');
      }
      const cashInKurus = await cashInForDay(tx, b.date);
      const expectedKurus = b.openingFloatKurus + cashInKurus;
      const differenceKurus = b.countedKurus - expectedKurus;
      if (differenceKurus !== 0 && !b.note) throw new BadRequestException('Kasa farkı varsa açıklama zorunlu');
      return tx.cashClosing.create({
        data: {
          businessDate: asDate(b.date),
          openingFloatKurus: b.openingFloatKurus,
          cashInKurus,
          expectedKurus,
          countedKurus: b.countedKurus,
          differenceKurus,
          note: b.note ?? null,
          closedById: user.id,
        },
        select,
      });
    });
  }
}

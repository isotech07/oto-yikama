import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { dateString } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { dayRange, trDate } from '../domain/time';
import { PrismaService } from '../prisma/prisma.service';
import { outstandingSql } from '../work-orders/receivables';

const SummaryQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tarih aralığı özeti (İstanbul günleri, iki uç dahil).
   * - Kasa: aralıkta alınan ödemeler (iade dahil) — ödeme anına göre.
   * - Ciro/KDV: aralıkta teslim edilen iş emirlerinin kalemleri — teslim anına göre.
   */
  @Roles('ADMIN')
  @Get('summary')
  async summary(@Query(new ZodPipe(SummaryQuery)) q: z.infer<typeof SummaryQuery>) {
    const from = q.from ?? trDate();
    const to = q.to ?? from;
    let range;
    try {
      range = dayRange(from, to);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (range.end.getTime() - range.start.getTime() > 366 * 86400000) throw new BadRequestException('En fazla 1 yıllık aralık seçilebilir');
    const { start, end } = range;

    const [byMethod, refunds, created, delivered, cancelled, open] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { createdAt: { gte: start, lt: end } },
        _sum: { amountKurus: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: start, lt: end }, amountKurus: { lt: 0 } },
        _sum: { amountKurus: true },
        _count: true,
      }),
      this.prisma.workOrder.count({ where: { deletedAt: null, createdAt: { gte: start, lt: end } } }),
      this.prisma.workOrder.count({ where: { deletedAt: null, deliveredAt: { gte: start, lt: end } } }),
      this.prisma.workOrder.count({ where: { deletedAt: null, cancelledAt: { gte: start, lt: end } } }),
      this.prisma.workOrder.count({ where: { deletedAt: null, status: { in: ['BEKLIYOR', 'YIKANIYOR', 'KURULANIYOR', 'HAZIR'] } } }),
    ]);

    // KDV dahil fiyattan KDV: satır bazında yarım yukarı yuvarlanır (domain/money.ts ile aynı formül).
    const services = await this.prisma.$queryRaw<{ service_name: string; qty: bigint; gross: bigint; vat: bigint }[]>(Prisma.sql`
      SELECT i.service_name,
             SUM(i.quantity) AS qty,
             SUM(i.unit_price * i.quantity) AS gross,
             SUM((i.unit_price * i.quantity) - ROUND((i.unit_price * i.quantity) * 10000.0 / (10000 + i.vat_rate_bp))) AS vat
      FROM work_order_items i
      JOIN work_orders w ON w.id = i.work_order_id
      WHERE i.deleted_at IS NULL AND w.deleted_at IS NULL
        AND w.delivered_at >= ${start} AND w.delivered_at < ${end}
      GROUP BY i.service_name
      ORDER BY gross DESC`);

    const workers = await this.prisma.$queryRaw<{ id: string; name: string; count: bigint }[]>(Prisma.sql`
      SELECT u.id, u.name, COUNT(*) AS count
      FROM work_orders w JOIN users u ON u.id = w.assigned_worker_id
      WHERE w.deleted_at IS NULL AND w.delivered_at >= ${start} AND w.delivered_at < ${end}
      GROUP BY u.id, u.name ORDER BY count DESC`);

    const pkgRows = await this.prisma.$queryRaw<{ count: bigint; gross: bigint | null; vat: bigint | null }[]>(Prisma.sql`
      SELECT COUNT(*) AS count, SUM(price_kurus) AS gross,
             SUM(price_kurus - ROUND(price_kurus * 10000.0 / (10000 + vat_rate_bp))) AS vat
      FROM customer_packages WHERE created_at >= ${start} AND created_at < ${end}`);
    const pkgGross = Number(pkgRows[0]?.gross ?? 0);
    const pkgVat = Number(pkgRows[0]?.vat ?? 0);
    const receivablesKurus = await outstandingSql(this.prisma);
    const closings = await this.prisma.cashClosing.findMany({
      where: { businessDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { businessDate: true, differenceKurus: true },
    });

    const methods = { NAKIT: 0, KART: 0, HAVALE: 0 };
    for (const m of byMethod) methods[m.method] = m._sum.amountKurus ?? 0;
    const cashTotal = methods.NAKIT + methods.KART + methods.HAVALE;
    const gross = services.reduce((s, r) => s + Number(r.gross), 0);
    const vat = services.reduce((s, r) => s + Number(r.vat), 0);

    return {
      from,
      to,
      payments: {
        totalKurus: cashTotal,
        byMethod: methods,
        refundKurus: refunds._sum.amountKurus ?? 0,
        refundCount: refunds._count,
      },
      workOrders: { created, delivered, cancelled, openNow: open },
      // Ciro = teslim edilen iş emirleri + satılan paketler (paket kalemleri iş emrinde 0 TL'dir, çift sayılmaz).
      revenue: { grossKurus: gross + pkgGross, vatKurus: vat + pkgVat, netKurus: gross + pkgGross - vat - pkgVat },
      packages: { sold: Number(pkgRows[0]?.count ?? 0), grossKurus: pkgGross, vatKurus: pkgVat },
      receivablesKurus,
      cashClosings: {
        closedDays: closings.length,
        totalDifferenceKurus: closings.reduce((s, c) => s + c.differenceKurus, 0),
      },
      services: services.map((r) => ({
        name: r.service_name,
        quantity: Number(r.qty),
        grossKurus: Number(r.gross),
        vatKurus: Number(r.vat),
      })),
      workers: workers.map((w) => ({ id: w.id, name: w.name, delivered: Number(w.count) })),
    };
  }
}

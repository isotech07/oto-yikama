import { Prisma } from '@prisma/client';
import { dayRange, trDate } from '../domain/time';

type Tx = Prisma.TransactionClient;

/**
 * Bir günün nakit kasası için transaction kilidi. Nakit tahsilat ve gün sonu kapanışı aynı kilidi alır;
 * böylece kapanış hesaplanırken araya nakit ödeme giremez.
 */
export async function lockCashDay(tx: Tx, date: string = trDate()) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cash:' + date}))`;
}

export async function isDayClosed(tx: Tx, date: string = trDate()): Promise<boolean> {
  return (await tx.cashClosing.count({ where: { businessDate: new Date(`${date}T00:00:00Z`) } })) > 0;
}

/** O gün alınan net nakit (iadeler düşülmüş), iş emri ve paket satışları dahil. */
export async function cashInForDay(tx: Tx, date: string): Promise<number> {
  const { start, end } = dayRange(date);
  const a = await tx.payment.aggregate({
    where: { method: 'NAKIT', createdAt: { gte: start, lt: end } },
    _sum: { amountKurus: true },
  });
  return a._sum.amountKurus ?? 0;
}

import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

/** Teslim edilmiş iş emirlerinde kalan toplam borç (veresiye). customerId verilirse yalnız o müşteri. */
export async function outstandingSql(db: Db, customerId?: string): Promise<number> {
  const filter = customerId ? Prisma.sql`AND w.customer_id = ${customerId}::uuid` : Prisma.empty;
  const rows = await db.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(
      COALESCE((SELECT SUM(i.unit_price * i.quantity) FROM work_order_items i WHERE i.work_order_id = w.id AND i.deleted_at IS NULL), 0)
      - COALESCE((SELECT SUM(p.amount_kurus) FROM payments p WHERE p.work_order_id = w.id), 0)
    ) AS total
    FROM work_orders w
    WHERE w.deleted_at IS NULL AND w.status = 'TESLIM_EDILDI' ${filter}`;
  return Number(rows[0]?.total ?? 0);
}

export const customerOutstanding = (db: Db, customerId: string) => outstandingSql(db, customerId);

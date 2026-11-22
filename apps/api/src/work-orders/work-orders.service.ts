import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma, WorkOrderStatus } from '@prisma/client';
import type { CurrentUserInfo } from '../auth/auth.types';
import { computeTotals } from '../domain/money';
import { allowedNextStatuses, canTransition, isOpen, OPEN_STATUSES } from '../domain/work-order-status';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/** Personelin yapabileceği geçişler: yalnızca yıkama süreci; teslim ve iptal kasaya aittir. */
const WORKER_TARGETS: readonly WorkOrderStatus[] = ['YIKANIYOR', 'KURULANIYOR', 'HAZIR'];

const detailInclude = {
  vehicle: { select: { id: true, plate: true, brand: true, model: true, color: true } },
  customer: { select: { id: true, name: true, phone: true } },
  assignedWorker: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, serviceId: true, serviceName: true, unitPrice: true, vatRateBp: true, quantity: true },
  },
  payments: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, amountKurus: true, method: true, note: true, createdAt: true, receivedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.WorkOrderInclude;

type WorkOrderRow = Prisma.WorkOrderGetPayload<{ include: typeof detailInclude }>;

export interface CreateWorkOrderInput {
  plate: string;
  customerId?: string | null;
  assignedWorkerId?: string | null;
  note?: string | null;
  items: { serviceId: string; quantity: number }[];
}

export interface PaymentInput {
  amountKurus: number;
  method: PaymentMethod;
  note?: string | null;
  idempotencyKey: string;
}

export interface ListFilter {
  scope: 'open' | 'all';
  status?: WorkOrderStatus;
  date?: { start: Date; end: Date };
  plate?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- okuma ----------

  async list(user: CurrentUserInfo, f: ListFilter) {
    const where: Prisma.WorkOrderWhereInput = { deletedAt: null };
    if (f.status) where.status = f.status;
    else if (f.scope === 'open') where.status = { in: [...OPEN_STATUSES] };
    if (f.date) where.createdAt = { gte: f.date.start, lt: f.date.end };
    if (f.plate) where.vehicle = { plate: { contains: f.plate } };
    if (user.role === 'WORKER') where.assignedWorkerId = user.id;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        include: detailInclude,
        orderBy: { createdAt: f.scope === 'open' ? 'asc' : 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return { items: rows.map((r) => this.present(r, user, false)), total, page: f.page, pageSize: f.pageSize };
  }

  async get(user: CurrentUserInfo, id: string) {
    const row = await this.prisma.workOrder.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
    // Personel yalnız kendisine atananı görür; başkasınınki için varlığı da açıklanmaz (404).
    if (!row || (user.role === 'WORKER' && row.assignedWorkerId !== user.id)) {
      throw new NotFoundException('İş emri bulunamadı');
    }
    return this.present(row, user, true);
  }

  // ---------- yazma ----------

  async create(user: CurrentUserInfo, input: CreateWorkOrderInput) {
    const id = await this.prisma.$transaction(async (tx) => {
      if (input.customerId) {
        const c = await tx.customer.count({ where: { id: input.customerId, deletedAt: null } });
        if (!c) throw new BadRequestException('Müşteri bulunamadı');
      }
      if (input.assignedWorkerId) await this.assertWorker(tx, input.assignedWorkerId);

      let vehicle = await tx.vehicle.findFirst({ where: { plate: input.plate, deletedAt: null } });
      if (!vehicle) {
        vehicle = await tx.vehicle.create({ data: { plate: input.plate, customerId: input.customerId ?? null } });
      } else if (!vehicle.customerId && input.customerId) {
        vehicle = await tx.vehicle.update({ where: { id: vehicle.id }, data: { customerId: input.customerId } });
      }

      const open = await tx.workOrder.findFirst({
        where: { vehicleId: vehicle.id, deletedAt: null, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      });
      if (open) throw new ConflictException({ message: 'Bu plakaya ait açık bir iş emri var', workOrderId: open.id });

      const itemsData = await this.buildItems(tx, input.items);

      let wo;
      try {
        wo = await tx.workOrder.create({
          data: {
            vehicleId: vehicle.id,
            customerId: input.customerId ?? vehicle.customerId,
            assignedWorkerId: input.assignedWorkerId ?? null,
            createdById: user.id,
            note: input.note ?? null,
            items: { create: itemsData },
            statusLogs: { create: { fromStatus: null, toStatus: 'BEKLIYOR', changedById: user.id } },
          },
          select: { id: true },
        });
      } catch (e) {
        // Eşzamanlı iki kayıt: kısmi unique index yakalar.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Bu plakaya ait açık bir iş emri var');
        }
        throw e;
      }
      return wo.id;
    });
    return this.get(user, id);
  }

  async addItems(user: CurrentUserInfo, id: string, items: CreateWorkOrderInput['items']) {
    await this.prisma.$transaction(async (tx) => {
      const wo = await this.lock(tx, id);
      if (!isOpen(wo.status)) throw new ConflictException('Kapanmış iş emrine hizmet eklenemez');
      const data = await this.buildItems(tx, items);
      await tx.workOrderItem.createMany({ data: data.map((d) => ({ ...d, workOrderId: id })) });
    });
    return this.get(user, id);
  }

  async removeItem(user: CurrentUserInfo, id: string, itemId: string) {
    await this.prisma.$transaction(async (tx) => {
      const wo = await this.lock(tx, id);
      if (!isOpen(wo.status)) throw new ConflictException('Kapanmış iş emrinden hizmet çıkarılamaz');
      const items = await tx.workOrderItem.findMany({ where: { workOrderId: id, deletedAt: null } });
      const target = items.find((i) => i.id === itemId);
      if (!target) throw new NotFoundException('Kalem bulunamadı');
      const remaining = items.filter((i) => i.id !== itemId);
      if (remaining.length === 0) throw new BadRequestException('İş emrinde en az bir hizmet olmalı');
      const paid = await this.paidSum(tx, id);
      if (computeTotals(remaining).grossKurus < paid) {
        throw new ConflictException('Bu kalem çıkarılırsa tahsil edilen tutar toplamı aşar; önce iade yapın');
      }
      await tx.workOrderItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
    });
    return this.get(user, id);
  }

  async assign(user: CurrentUserInfo, id: string, workerId: string | null) {
    await this.prisma.$transaction(async (tx) => {
      const wo = await this.lock(tx, id);
      if (!isOpen(wo.status)) throw new ConflictException('Kapanmış iş emrine atama yapılamaz');
      if (workerId) await this.assertWorker(tx, workerId);
      await tx.workOrder.update({ where: { id }, data: { assignedWorkerId: workerId } });
    });
    return this.get(user, id);
  }

  async updateNote(user: CurrentUserInfo, id: string, note: string | null) {
    const r = await this.prisma.workOrder.updateMany({ where: { id, deletedAt: null }, data: { note } });
    if (r.count === 0) throw new NotFoundException('İş emri bulunamadı');
    return this.get(user, id);
  }

  async changeStatus(user: CurrentUserInfo, id: string, to: WorkOrderStatus) {
    await this.prisma.$transaction(async (tx) => {
      const wo = await this.lock(tx, id);
      if (user.role === 'WORKER') {
        if (wo.assignedWorkerId !== user.id) throw new NotFoundException('İş emri bulunamadı');
        if (!WORKER_TARGETS.includes(to)) throw new ForbiddenException('Bu durum değişikliği için yetkiniz yok');
      }
      if (!canTransition(wo.status, to)) {
        throw new ConflictException(`${wo.status} durumundan ${to} durumuna geçilemez`);
      }
      if (to === 'TESLIM_EDILDI') {
        const balance = await this.balance(tx, id);
        if (balance !== 0) throw new ConflictException('Ödeme tamamlanmadan araç teslim edilemez');
      }
      if (to === 'CANCELLED') {
        const paid = await this.paidSum(tx, id);
        if (paid !== 0) throw new ConflictException('Tahsilatı olan iş emri iptal edilemez; önce iade yapın');
      }
      const now = new Date();
      await tx.workOrder.update({
        where: { id },
        data: {
          status: to,
          ...(to === 'TESLIM_EDILDI' ? { deliveredAt: now } : {}),
          ...(to === 'CANCELLED' ? { cancelledAt: now } : {}),
        },
      });
      await tx.workOrderStatusLog.create({ data: { workOrderId: id, fromStatus: wo.status, toStatus: to, changedById: user.id } });
    });
    return this.get(user, id);
  }

  async addPayment(user: CurrentUserInfo, id: string, p: PaymentInput) {
    // Aynı anahtarla tekrar gelen istek: ilk kaydı döndür (çift tahsilat yok).
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
    if (existing) {
      if (existing.workOrderId !== id || existing.amountKurus !== p.amountKurus) {
        throw new ConflictException('Bu işlem anahtarı başka bir ödeme için kullanılmış');
      }
      return this.get(user, id);
    }

    try {
    await this.prisma.$transaction(async (tx) => {
      const wo = await this.lock(tx, id);
      if (p.amountKurus > 0) {
        if (wo.status === 'CANCELLED') throw new ConflictException('İptal edilmiş iş emrine tahsilat yapılamaz');
        const balance = await this.balance(tx, id);
        if (p.amountKurus > balance) throw new ConflictException('Tahsilat kalan bakiyeyi aşamaz');
      } else {
        if (user.role !== 'ADMIN') throw new ForbiddenException('İadeyi yalnızca yönetici yapabilir');
        if (!p.note) throw new BadRequestException('İade için açıklama zorunlu');
        const paid = await this.paidSum(tx, id);
        if (-p.amountKurus > paid) throw new ConflictException('İade tutarı tahsil edilen tutarı aşamaz');
      }
      await tx.payment.create({
        data: {
          workOrderId: id,
          amountKurus: p.amountKurus,
          method: p.method,
          note: p.note ?? null,
          idempotencyKey: p.idempotencyKey,
          receivedById: user.id,
        },
      });
    });
    } catch (e) {
      // Aynı anahtarla eşzamanlı ikinci istek: ilki kazandı, sonucu döndür.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.get(user, id);
      throw e;
    }
    return this.get(user, id);
  }

  // ---------- yardımcılar ----------

  /** İş emri satırını kilitler: aynı iş emrine eşzamanlı tahsilat/durum değişikliği sırayla işlenir. */
  private async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM work_orders WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('İş emri bulunamadı');
    return tx.workOrder.findUniqueOrThrow({ where: { id } });
  }

  private async paidSum(tx: Tx, id: string): Promise<number> {
    const a = await tx.payment.aggregate({ where: { workOrderId: id }, _sum: { amountKurus: true } });
    return a._sum.amountKurus ?? 0;
  }

  private async balance(tx: Tx, id: string): Promise<number> {
    const items = await tx.workOrderItem.findMany({ where: { workOrderId: id, deletedAt: null } });
    return computeTotals(items).grossKurus - (await this.paidSum(tx, id));
  }

  private async assertWorker(tx: Tx, workerId: string) {
    const w = await tx.user.count({ where: { id: workerId, role: 'WORKER', isActive: true, deletedAt: null } });
    if (!w) throw new BadRequestException('Atanacak personel bulunamadı');
  }

  /** Hizmet bilgilerini o anki fiyat ve KDV ile kopyalar. */
  private async buildItems(tx: Tx, items: CreateWorkOrderInput['items']) {
    const ids = [...new Set(items.map((i) => i.serviceId))];
    const services = await tx.service.findMany({ where: { id: { in: ids }, deletedAt: null, isActive: true } });
    const byId = new Map(services.map((s) => [s.id, s]));
    return items.map((i) => {
      const s = byId.get(i.serviceId);
      if (!s) throw new BadRequestException('Seçilen hizmetlerden biri bulunamadı veya pasif');
      return { serviceId: s.id, serviceName: s.name, unitPrice: s.priceKurus, vatRateBp: s.vatRateBp, quantity: i.quantity };
    });
  }

  private present(row: WorkOrderRow, user: CurrentUserInfo, detail: boolean) {
    const totals = computeTotals(row.items);
    const paidKurus = row.payments.reduce((s, p) => s + p.amountKurus, 0);
    const balanceKurus = totals.grossKurus - paidKurus;
    const isWorker = user.role === 'WORKER';

    let allowedNext = allowedNextStatuses(row.status).filter((s) => {
      if (isWorker) return WORKER_TARGETS.includes(s);
      if (s === 'TESLIM_EDILDI') return balanceKurus === 0;
      if (s === 'CANCELLED') return paidKurus === 0;
      return true;
    });
    if (isWorker && row.assignedWorkerId !== user.id) allowedNext = [];

    return {
      id: row.id,
      status: row.status,
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deliveredAt: row.deliveredAt,
      cancelledAt: row.cancelledAt,
      vehicle: row.vehicle,
      // Personele müşteri iletişim bilgisi gösterilmez (veri minimizasyonu).
      customer: row.customer ? (isWorker ? { id: row.customer.id, name: row.customer.name, phone: null } : row.customer) : null,
      assignedWorker: row.assignedWorker,
      createdBy: row.createdBy,
      items: row.items.map((i) => ({ ...i, lineTotal: i.unitPrice * i.quantity })),
      totals,
      paidKurus: isWorker ? null : paidKurus,
      balanceKurus: isWorker ? null : balanceKurus,
      payments: detail && !isWorker ? row.payments : undefined,
      allowedNext,
    };
  }
}

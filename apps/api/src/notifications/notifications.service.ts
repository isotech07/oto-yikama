import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider';

type Tx = Prisma.TransactionClient;
export const MAX_ATTEMPTS = 5;

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Yeniden deneme bekleme süresi: 1, 2, 4, 8 dk... (en fazla 60 dk) */
export function backoffMs(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
}

@Injectable()
export class NotificationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Bildirim');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NOTIFY_WORKER === 'off') return;
    this.timer = setInterval(() => void this.processDue(), 15_000);
    this.logger.log(`SMS gönderici çalışıyor (sağlayıcı: ${this.provider.name})`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * "Aracınız hazır" bildirimini kuyruğa yazar. İş emri ile AYNI transaction içinde çağrılır;
   * SMS gönderilemese bile durum değişikliği geri alınmaz. (iş emri, tür) benzersiz: tekrar yazılmaz.
   */
  async enqueueReady(tx: Tx, workOrderId: string): Promise<void> {
    const settings = await tx.businessSettings.findUnique({ where: { id: 1 } });
    if (!settings?.smsEnabled) return;
    const wo = await tx.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { vehicle: { select: { plate: true } }, customer: true },
    });
    const c = wo.customer;
    if (!c || c.deletedAt || !c.smsConsent || !c.phone) return;
    await tx.notification.createMany({
      data: [
        {
          kind: 'READY',
          workOrderId,
          customerId: c.id,
          toPhone: c.phone,
          body: renderTemplate(settings.smsReadyTemplate, { musteri: c.name, plaka: wo.vehicle.plate, isletme: settings.name }),
        },
      ],
      skipDuplicates: true,
    });
  }

  /** Vadesi gelen bildirimleri gönderir. Birden fazla süreç çalışsa da SKIP LOCKED ile aynı kayıt iki kez alınmaz. */
  async processDue(limit = 20): Promise<{ sent: number; failed: number }> {
    if (this.running) return { sent: 0, failed: 0 };
    this.running = true;
    let sent = 0;
    let failed = 0;
    try {
      // Kayıtları "kirala": deneme sayısını artır ve bir sonraki denemeyi ileri at (süreç çökerse sonra yeniden alınır).
      const claimed = await this.prisma.$queryRaw<{ id: string; to_phone: string; body: string; attempts: number }[]>`
        UPDATE notifications SET attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes'
        WHERE id IN (
          SELECT id FROM notifications
          WHERE status = 'PENDING' AND next_attempt_at <= now()
          ORDER BY next_attempt_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, to_phone, body, attempts`;

      for (const n of claimed) {
        try {
          await this.provider.send(n.to_phone, n.body);
          await this.prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
          sent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message.slice(0, 200) : 'bilinmeyen hata';
          const final = n.attempts >= MAX_ATTEMPTS;
          await this.prisma.notification.update({
            where: { id: n.id },
            data: {
              lastError: msg,
              status: final ? 'FAILED' : 'PENDING',
              nextAttemptAt: new Date(Date.now() + backoffMs(n.attempts)),
            },
          });
          failed++;
          this.logger.warn(`Bildirim ${n.id} gönderilemedi (deneme ${n.attempts}${final ? ', vazgeçildi' : ''}): ${msg}`);
        }
      }
    } catch (e) {
      this.logger.error(`Bildirim kuyruğu işlenemedi: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
    return { sent, failed };
  }
}

import { Body, Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { z } from 'zod';
import type { CurrentUserInfo } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { dateString, IdParam, optionalText, PageQuery } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { dayRange } from '../domain/time';
import { plateField } from '../vehicles/vehicles.controller';
import { WorkOrdersService } from './work-orders.service';

const statusEnum = z.nativeEnum(WorkOrderStatus);
const itemsField = z
  .array(
    z.object({
      serviceId: z.string().uuid(),
      quantity: z.number().int().min(1).max(20).default(1),
      customerPackageId: z.string().uuid().nullish(),
    }),
  )
  .min(1, 'En az bir hizmet seçin')
  .max(20);

const CreateBody = z.object({
  plate: plateField,
  customerId: z.string().uuid().nullish(),
  assignedWorkerId: z.string().uuid().nullish(),
  note: optionalText(500),
  items: itemsField,
});
const ListQuery = PageQuery.extend({
  scope: z.enum(['open', 'all', 'unpaid']).default('open'),
  status: statusEnum.optional(),
  date: dateString.optional(),
  plate: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .optional(),
});
const StatusBody = z.object({ to: statusEnum });
const AssignBody = z.object({ workerId: z.string().uuid().nullable() });
const ItemsBody = z.object({ items: itemsField });
const NoteBody = z.object({ note: optionalText(500) });
const PaymentBody = z.object({
  amountKurus: z
    .number()
    .int('Tutar kuruş cinsinden tam sayı olmalı')
    .refine((v) => v !== 0, 'Tutar sıfır olamaz')
    .refine((v) => Math.abs(v) <= 100_000_000, 'Tutar çok büyük'),
  method: z.enum(['NAKIT', 'KART', 'HAVALE']),
  note: optionalText(300),
  idempotencyKey: z.string().uuid('Geçersiz işlem anahtarı'),
});

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly service: WorkOrdersService) {}

  @Roles('ADMIN', 'CASHIER', 'WORKER')
  @Get()
  list(@CurrentUser() user: CurrentUserInfo, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.service.list(user, {
      scope: q.scope,
      status: q.status,
      date: q.date ? dayRange(q.date) : undefined,
      plate: q.plate || undefined,
      page: q.page,
      pageSize: q.pageSize,
    });
  }

  @Roles('ADMIN', 'CASHIER', 'WORKER')
  @Get(':id')
  get(@CurrentUser() user: CurrentUserInfo, @IdParam() id: string) {
    return this.service.get(user, id);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post()
  create(@CurrentUser() user: CurrentUserInfo, @Body(new ZodPipe(CreateBody)) body: z.infer<typeof CreateBody>) {
    return this.service.create(user, body);
  }

  /** Personel yalnız kendisine atanan iş emrinde yıkama durumlarını ilerletebilir (serviste kontrol edilir). */
  @Roles('ADMIN', 'CASHIER', 'WORKER')
  @Post(':id/status')
  status(@CurrentUser() user: CurrentUserInfo, @IdParam() id: string, @Body(new ZodPipe(StatusBody)) b: z.infer<typeof StatusBody>) {
    return this.service.changeStatus(user, id, b.to);
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch(':id/assign')
  assign(@CurrentUser() user: CurrentUserInfo, @IdParam() id: string, @Body(new ZodPipe(AssignBody)) b: z.infer<typeof AssignBody>) {
    return this.service.assign(user, id, b.workerId);
  }

  @Roles('ADMIN', 'CASHIER')
  @Patch(':id/note')
  note(@CurrentUser() user: CurrentUserInfo, @IdParam() id: string, @Body(new ZodPipe(NoteBody)) b: z.infer<typeof NoteBody>) {
    return this.service.updateNote(user, id, b.note ?? null);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/items')
  addItems(@CurrentUser() user: CurrentUserInfo, @IdParam() id: string, @Body(new ZodPipe(ItemsBody)) b: z.infer<typeof ItemsBody>) {
    return this.service.addItems(user, id, b.items);
  }

  @Roles('ADMIN', 'CASHIER')
  @Delete(':id/items/:itemId')
  removeItem(@CurrentUser() user: CurrentUserInfo, @IdParam() id: string, @IdParam('itemId') itemId: string) {
    return this.service.removeItem(user, id, itemId);
  }

  /** Pozitif tutar: tahsilat (ADMIN, CASHIER). Negatif tutar: iade (yalnız ADMIN, serviste kontrol). */
  @Roles('ADMIN', 'CASHIER')
  @Post(':id/payments')
  pay(@CurrentUser() user: CurrentUserInfo, @IdParam() id: string, @Body(new ZodPipe(PaymentBody)) b: z.infer<typeof PaymentBody>) {
    return this.service.addPayment(user, id, b);
  }
}

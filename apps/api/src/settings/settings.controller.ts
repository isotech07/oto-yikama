import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { optionalText } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const UpdateSettings = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  address: optionalText(300),
  phone: optionalText(30),
  taxOffice: optionalText(80),
  taxNumber: z
    .string()
    .trim()
    .regex(/^(\d{10,11})?$/, 'Vergi/T.C. kimlik no 10 veya 11 haneli olmalı')
    .transform((v) => v || null)
    .nullish(),
  receiptFooter: optionalText(300),
  smsEnabled: z.boolean().optional(),
  smsReadyTemplate: z
    .string()
    .trim()
    .min(10)
    .max(300)
    .refine((v) => v.includes('{plaka}'), 'Şablon {plaka} içermeli')
    .optional(),
});

const select = {
  name: true,
  address: true,
  phone: true,
  taxOffice: true,
  taxNumber: true,
  receiptFooter: true,
  smsEnabled: true,
  smsReadyTemplate: true,
} as const;

@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Fiş başlığı için kasa da okur. */
  @Roles('ADMIN', 'CASHIER')
  @Get()
  get() {
    return this.prisma.businessSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, select });
  }

  @Roles('ADMIN')
  @Patch()
  update(@Body(new ZodPipe(UpdateSettings)) body: z.infer<typeof UpdateSettings>) {
    return this.prisma.businessSettings.upsert({ where: { id: 1 }, update: body, create: { id: 1, ...body }, select });
  }
}

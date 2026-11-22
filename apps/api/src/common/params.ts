import { Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from './zod.pipe';

/** UUID biçiminde yol parametresi; değilse 400. */
export const IdParam = (name = 'id') => Param(name, new ZodPipe(z.string().uuid('Geçersiz kimlik')));

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı');

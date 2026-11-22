import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Prisma hatalarını anlamlı HTTP yanıtlarına çevirir.
 * Loglara yalnızca hata kodu ve kısıt/alan adı yazılır; değerler (plaka, telefon) yazılmaz.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(e: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      switch (e.code) {
        case 'P2002':
          return res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: 'Bu kayıt zaten mevcut' });
        case 'P2025':
          return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Kayıt bulunamadı' });
        case 'P2003':
          return res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'İlişkili kayıt bulunamadı' });
      }
      this.logger.error(`Prisma ${e.code} ${JSON.stringify(e.meta?.target ?? e.meta?.modelName ?? '')}`);
    } else {
      // CHECK / trigger ihlalleri bu sınıfla gelir; kısıt adı mesajın içinde, değerler değil.
      const constraint = /constraint "([^"]+)"/.exec(e.message)?.[1];
      if (constraint || /silinemez|değiştirilemez/.test(e.message)) {
        this.logger.warn(`DB kısıtı ihlali: ${constraint ?? 'payments_immutable'}`);
        return res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'Geçersiz veri' });
      }
      this.logger.error('Bilinmeyen veritabanı hatası');
    }
    return res.status(500).json({ statusCode: 500, message: 'Beklenmeyen bir hata oluştu' });
  }
}

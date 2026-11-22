import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { securityHeaders, serveWeb } from './static-web';

/** main.ts ve testler aynı yapılandırmayı kullanır. */
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalFilters(new PrismaExceptionFilter());
  const http = app.getHttpAdapter().getInstance();
  http.disable('x-powered-by');
  // Önümüzdeki güvenilir proxy sayısı (Docker Compose: Caddy = 1). İstemci IP'si hız sınırı için kullanılır.
  http.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  securityHeaders(app);
  serveWeb(app);
}

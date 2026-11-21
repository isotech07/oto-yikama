import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** main.ts ve testler aynı yapılandırmayı kullanır. */
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  const http = app.getHttpAdapter().getInstance();
  http.disable('x-powered-by');
  http.set('trust proxy', 1);
}

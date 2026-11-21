import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  // Not: İstek gövdeleri loglanmaz (telefon/plaka gibi kişisel veriler içerebilir).
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  setupApp(app);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API http://localhost:${port}/api`);
}
void bootstrap();

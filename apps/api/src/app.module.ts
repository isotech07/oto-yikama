import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CustomersController } from './customers/customers.controller';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsController } from './reports/reports.controller';
import { ServicesController } from './services/services.controller';
import { UsersController } from './users/users.controller';
import { VehiclesController } from './vehicles/vehicles.controller';
import { WorkOrdersController } from './work-orders/work-orders.controller';
import { WorkOrdersService } from './work-orders/work-orders.service';

@Module({
  imports: [
    // Genel hız sınırı; giriş endpoint'inde daha sıkı limit var (AuthController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: () => Number(process.env.API_RATE_LIMIT ?? 300) }]),
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    CustomersController,
    VehiclesController,
    ServicesController,
    UsersController,
    WorkOrdersController,
    ReportsController,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, WorkOrdersService],
})
export class AppModule {}

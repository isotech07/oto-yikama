import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { createSmsProvider, SMS_PROVIDER } from './sms-provider';

@Global()
@Module({
  providers: [{ provide: SMS_PROVIDER, useFactory: () => createSmsProvider() }, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

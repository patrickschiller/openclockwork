import { Global, Module } from '@nestjs/common';
import { RequestNotificationService } from './request-notification.service';

@Global()
@Module({
  providers: [RequestNotificationService],
  exports: [RequestNotificationService],
})
export class NotificationsModule {}

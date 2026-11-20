import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { LocalFsStorageAdapter } from './local-fs-storage.adapter';
import { STORAGE_ADAPTER } from './storage-adapter';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    { provide: STORAGE_ADAPTER, useClass: LocalFsStorageAdapter },
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

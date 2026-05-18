import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { LocalFsStorageAdapter } from './local-fs-storage.adapter';
import { STORAGE_ADAPTER } from './storage-adapter';

/**
 * Registers the LocalFsStorageAdapter as the default `StorageAdapter`
 * binding. Other implementations (Azure Blob, S3) plug in by replacing
 * this provider — the service depends on the interface, not the impl.
 */
@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    LocalFsStorageAdapter,
    { provide: STORAGE_ADAPTER, useExisting: LocalFsStorageAdapter },
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

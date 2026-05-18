import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AzureBlobStorageAdapter } from './azure-blob-storage.adapter';
import { LocalFsStorageAdapter } from './local-fs-storage.adapter';
import { STORAGE_ADAPTER, type StorageAdapter } from './storage-adapter';

/**
 * Picks a StorageAdapter at module-load time based on STORAGE_BACKEND:
 *   - "local" (default)  → LocalFsStorageAdapter, writes under ATTACHMENTS_DIR
 *   - "azure-blob"       → AzureBlobStorageAdapter, uses managed identity
 *
 * The service depends on the STORAGE_ADAPTER interface; swapping
 * implementations is a one-env-var change with no code edits.
 */
@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    LocalFsStorageAdapter,
    AzureBlobStorageAdapter,
    {
      provide: STORAGE_ADAPTER,
      inject: [ConfigService, LocalFsStorageAdapter, AzureBlobStorageAdapter],
      useFactory: (
        config: ConfigService,
        localFs: LocalFsStorageAdapter,
        azureBlob: AzureBlobStorageAdapter,
      ): StorageAdapter => {
        const backend = (config.get<string>('STORAGE_BACKEND') ?? 'local').toLowerCase();
        const log = new Logger('StorageAdapterFactory');
        if (backend === 'azure-blob') {
          log.log('Using AzureBlobStorageAdapter for attachments');
          return azureBlob;
        }
        log.log('Using LocalFsStorageAdapter for attachments (STORAGE_BACKEND=local)');
        return localFs;
      },
    },
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

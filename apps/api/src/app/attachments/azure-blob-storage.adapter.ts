import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import type { PutInput, StorageAdapter } from './storage-adapter';

/**
 * Azure Blob Storage implementation of StorageAdapter. Authenticates via
 * DefaultAzureCredential — in Azure Container Apps this picks up the
 * system-assigned managed identity automatically; locally it falls back
 * to `az login` / VS Code credentials, which is exactly what you want
 * for a dev override.
 *
 * Required env:
 *   AZURE_BLOB_ACCOUNT      e.g. "oclockdevab12cd"
 *   AZURE_BLOB_CONTAINER    e.g. "requestattachments"
 */
@Injectable()
export class AzureBlobStorageAdapter implements StorageAdapter {
  private readonly log = new Logger(AzureBlobStorageAdapter.name);
  // Constructed lazily — we don't want this provider to crash module init
  // in local dev when the env vars aren't set, only when it's actually
  // selected as the active StorageAdapter and first used.
  private container: ContainerClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private ensure(): ContainerClient {
    if (this.container) return this.container;
    const account = this.config.get<string>('AZURE_BLOB_ACCOUNT');
    const containerName = this.config.get<string>('AZURE_BLOB_CONTAINER');
    if (!account || !containerName) {
      throw new Error(
        'AZURE_BLOB_ACCOUNT and AZURE_BLOB_CONTAINER must be set when STORAGE_BACKEND=azure-blob',
      );
    }
    const url = `https://${account}.blob.core.windows.net`;
    const service = new BlobServiceClient(url, new DefaultAzureCredential());
    this.container = service.getContainerClient(containerName);
    this.log.log(`AzureBlobStorageAdapter ready (account=${account}, container=${containerName})`);
    return this.container;
  }

  async put(input: PutInput): Promise<{ storageKey: string }> {
    const ext = sanitiseExtension(input.fileName);
    const id = randomUUID();
    const storageKey = `${input.requestId}/${id}${ext}`;
    const blob = this.ensure().getBlockBlobClient(storageKey);
    await blob.uploadData(input.data, {
      blobHTTPHeaders: { blobContentType: 'application/octet-stream' },
    });
    return { storageKey };
  }

  async get(storageKey: string): Promise<NodeJS.ReadableStream> {
    const blob = this.ensure().getBlockBlobClient(storageKey);
    const download = await blob.download();
    if (!download.readableStreamBody) {
      // The SDK exposes a readable stream on Node; if it's missing we're
      // in an unsupported runtime. Surface that clearly rather than
      // returning undefined cast to a stream.
      throw new Error(`Blob "${storageKey}" did not return a readable stream`);
    }
    return download.readableStreamBody as Readable;
  }

  async delete(storageKey: string): Promise<void> {
    const blob = this.ensure().getBlockBlobClient(storageKey);
    // deleteIfExists keeps the contract idempotent — see StorageAdapter docs.
    await blob.deleteIfExists();
  }
}

function sanitiseExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!/^\.(pdf|png|jpe?g|gif|webp|heic|txt|docx|odt)$/.test(ext)) return '';
  return ext;
}

import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PutInput, StorageAdapter } from './storage-adapter';

/**
 * Filesystem-backed StorageAdapter. The base directory is `ATTACHMENTS_DIR`
 * (env), defaulting to `data/attachments` relative to the process cwd.
 *
 * Files are stored at `<base>/<requestId>/<uuid><extension>`. The original
 * filename is NEVER used as a path component — that's metadata in the DB,
 * not a storage primitive, and it would expose us to traversal attacks.
 */
@Injectable()
export class LocalFsStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = config.get<string>('ATTACHMENTS_DIR') ?? path.resolve('data', 'attachments');
  }

  async put(input: PutInput): Promise<{ storageKey: string }> {
    const ext = sanitiseExtension(input.fileName);
    const id = randomUUID();
    const relative = path.posix.join(input.requestId, `${id}${ext}`);
    const absolute = this.resolveAbsolute(relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, input.data);
    return { storageKey: relative };
  }

  async get(storageKey: string): Promise<NodeJS.ReadableStream> {
    const absolute = this.resolveAbsolute(storageKey);
    // Touch first so the caller gets a Promise-rejecting ENOENT rather than
    // a stream that errors mid-pipe.
    await fs.access(absolute);
    return createReadStream(absolute);
  }

  async delete(storageKey: string): Promise<void> {
    const absolute = this.resolveAbsolute(storageKey);
    await fs.rm(absolute, { force: true });
  }

  /**
   * Resolve a storage key under the base dir and refuse anything that
   * escapes — defence-in-depth against a bad key persisted in the DB.
   */
  private resolveAbsolute(storageKey: string): string {
    const absolute = path.resolve(this.baseDir, storageKey);
    const normalisedBase = path.resolve(this.baseDir) + path.sep;
    if (!absolute.startsWith(normalisedBase) && absolute !== path.resolve(this.baseDir)) {
      throw new Error(`Attachment key "${storageKey}" escapes the storage root`);
    }
    return absolute;
  }
}

function sanitiseExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  // Only allow a small whitelist of "document-like" extensions for now.
  // The MIME type is validated separately at the controller boundary.
  if (!/^\.(pdf|png|jpe?g|gif|webp|heic|txt|docx|odt)$/.test(ext)) return '';
  return ext;
}

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt.strategy';
import { STORAGE_ADAPTER, type StorageAdapter } from './storage-adapter';
import {
  toAttachmentDto,
  type AttachmentDto,
} from './attachments.dto';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Whitelist mirrors the extension whitelist in LocalFsStorageAdapter —
// validated *here* because the storage adapter must not know about HTTP.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
]);

export interface AttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async upload(actor: JwtUser, requestId: string, file: AttachmentFile): Promise<AttachmentDto> {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_SIZE_BYTES) {
      throw new PayloadTooLargeException(`File exceeds the ${MAX_SIZE_BYTES} byte limit`);
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported MIME type "${file.mimetype}"`);
    }
    const request = await this.findAndAssertRequestAccess(actor, requestId, 'write');
    if (request.type !== 'SpecialLeave') {
      // Tighten the scope: today only Sonderurlaub needs Belege. Other
      // request types can opt-in later by relaxing this check.
      throw new BadRequestException(
        'Attachments are only supported for SpecialLeave requests',
      );
    }

    const { storageKey } = await this.storage.put({
      requestId,
      fileName: file.originalname,
      data: file.buffer,
    });

    const row = await this.prisma.requestAttachment.create({
      data: {
        requestId,
        fileName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        uploadedById: actor.id,
      },
    });
    return toAttachmentDto(row);
  }

  async list(actor: JwtUser, requestId: string): Promise<AttachmentDto[]> {
    await this.findAndAssertRequestAccess(actor, requestId, 'read');
    const rows = await this.prisma.requestAttachment.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAttachmentDto);
  }

  async download(
    actor: JwtUser,
    attachmentId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; meta: AttachmentDto }> {
    const row = await this.prisma.requestAttachment.findUnique({ where: { id: attachmentId } });
    if (!row) throw new NotFoundException(`Attachment ${attachmentId} not found`);
    await this.findAndAssertRequestAccess(actor, row.requestId, 'read');
    const stream = await this.storage.get(row.storageKey);
    return { stream, meta: toAttachmentDto(row) };
  }

  async remove(actor: JwtUser, attachmentId: string): Promise<void> {
    const row = await this.prisma.requestAttachment.findUnique({ where: { id: attachmentId } });
    if (!row) throw new NotFoundException(`Attachment ${attachmentId} not found`);
    const request = await this.findAndAssertRequestAccess(actor, row.requestId, 'write');
    // Don't let an employee delete attachments off an already-decided
    // request — that would erase audit trail. HRAdmin can still clean up.
    if (
      actor.role !== 'HRAdmin' &&
      (request.workflowState === 'Approved' || request.workflowState === 'Rejected')
    ) {
      throw new ForbiddenException(
        'Attachments on a decided request can only be removed by an HRAdmin',
      );
    }
    await this.prisma.requestAttachment.delete({ where: { id: attachmentId } });
    await this.storage.delete(row.storageKey);
  }

  /**
   * Access rules for both read and write:
   *   - owner of the request: read + write (until decided, see above)
   *   - currently-assigned approver: read + write
   *   - HRAdmin: read + write
   *   - everyone else: forbidden
   */
  private async findAndAssertRequestAccess(
    actor: JwtUser,
    requestId: string,
    _mode: 'read' | 'write',
  ) {
    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(`Request ${requestId} not found`);
    if (actor.role === 'HRAdmin') return request;
    if (actor.id === request.employeeId) return request;
    if (request.currentApproverId && actor.id === request.currentApproverId) return request;
    throw new ForbiddenException('You may not access attachments on this request');
  }
}

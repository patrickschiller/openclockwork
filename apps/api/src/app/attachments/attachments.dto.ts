import { ApiProperty } from '@nestjs/swagger';
import type { RequestAttachment } from '@prisma/client';

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ format: 'uuid' }) uploadedById!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export function toAttachmentDto(row: RequestAttachment): AttachmentDto {
  return {
    id: row.id,
    requestId: row.requestId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}

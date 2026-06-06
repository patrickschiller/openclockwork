import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { Request } from '@prisma/client';

const REQUEST_TYPES = ['Vacation', 'HomeOffice', 'SpecialLeave', 'TimeAdjustment'] as const;

export class CreateRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ enum: REQUEST_TYPES })
  @IsEnum(REQUEST_TYPES)
  type!: (typeof REQUEST_TYPES)[number];

  @ApiProperty({ format: 'date-time', example: '2026-08-03T00:00:00.000Z' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-07T00:00:00.000Z' })
  @IsISO8601()
  to!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}

export class CreateVacationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  to!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  substituteId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Take the first day as a half-day' })
  @IsOptional()
  @IsBoolean()
  halfDayStart?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Take the last day as a half-day' })
  @IsOptional()
  @IsBoolean()
  halfDayEnd?: boolean;
}

export class TransitionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorId!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class ManagerApproveDto extends TransitionDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresHrConfirmation?: boolean;
}

export class TransitionWithRequiredNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorId!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  note!: string;
}

export class BulkApproveDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresHrConfirmation?: boolean;
}

export class BulkRejectDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  note!: string;
}

export interface BulkResult {
  id: string;
  ok: boolean;
  workflowState?: string;
  status?: string;
  error?: string;
}

export interface RequestDto {
  id: string;
  employeeId: string;
  type: string;
  status: string;
  workflowState: string;
  from: string;
  to: string;
  reason: string | null;
  requiresApproval: boolean;
  approverId: string | null;
  currentApproverId: string | null;
  substituteId: string | null;
  substituteAcceptedAt: string | null;
  hrConfirmedAt: string | null;
  cancelledAt: string | null;
  calculatedDays: number;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export function toRequestDto(r: Request): RequestDto {
  return {
    id: r.id,
    employeeId: r.employeeId,
    type: r.type,
    status: r.status,
    workflowState: r.workflowState,
    from: r.from.toISOString(),
    to: r.to.toISOString(),
    reason: r.reason,
    requiresApproval: r.requiresApproval,
    approverId: r.approverId,
    currentApproverId: r.currentApproverId,
    substituteId: r.substituteId,
    substituteAcceptedAt: r.substituteAcceptedAt ? r.substituteAcceptedAt.toISOString() : null,
    hrConfirmedAt: r.hrConfirmedAt ? r.hrConfirmedAt.toISOString() : null,
    cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
    calculatedDays: Number(r.calculatedDays),
    halfDayStart: r.halfDayStart,
    halfDayEnd: r.halfDayEnd,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface RequestEventDto {
  id: string;
  requestId: string;
  at: string;
  actorId: string | null;
  kind: string;
  note: string | null;
}

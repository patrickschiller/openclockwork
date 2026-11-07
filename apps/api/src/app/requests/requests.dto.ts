import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
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

const REQUEST_TYPES = [
  'Vacation',
  'HomeOffice',
  'SpecialLeave',
  'TimeAdjustment',
] as const;

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

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
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

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  substituteId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;

  @ApiPropertyOptional({
    default: false,
    description: 'Take the first day as a half-day',
  })
  @IsOptional()
  @IsBoolean()
  halfDayStart?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Take the last day as a half-day',
  })
  @IsOptional()
  @IsBoolean()
  halfDayEnd?: boolean;
}

/** Complete editable values. Request type and owner are immutable. */
export class UpdateDraftRequestDto extends OmitType(CreateVacationDto, [
  'employeeId',
] as const) {
  @ApiProperty({
    format: 'date-time',
    description:
      'updatedAt from the version being edited; stale writes return 409',
  })
  @IsISO8601()
  expectedUpdatedAt!: string;
}

export class TransitionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actorId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
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

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
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

export class RequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;
  @ApiProperty()
  employeeName!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
  @ApiProperty({ enum: REQUEST_TYPES })
  type!: string;
  @ApiProperty()
  status!: string;
  @ApiProperty()
  workflowState!: string;
  @ApiProperty({ format: 'date-time' })
  from!: string;
  @ApiProperty({ format: 'date-time' })
  to!: string;
  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;
  @ApiProperty()
  requiresApproval!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  approverId!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  currentApproverId!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  substituteId!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  substituteAcceptedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  hrConfirmedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  cancelledAt!: string | null;
  @ApiProperty()
  calculatedDays!: number;
  @ApiProperty()
  halfDayStart!: boolean;
  @ApiProperty()
  halfDayEnd!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  decidedAt!: string | null;
  @ApiProperty({ type: String, nullable: true })
  decisionNote!: string | null;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export function toRequestDto(
  r: Request & { employee: { firstName: string; lastName: string } },
): RequestDto {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    updatedAt: r.updatedAt.toISOString(),
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
    substituteAcceptedAt: r.substituteAcceptedAt
      ? r.substituteAcceptedAt.toISOString()
      : null,
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

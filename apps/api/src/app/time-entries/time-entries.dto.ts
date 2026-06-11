import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { TimeEntry } from '@prisma/client';
import { summarize, type TimeSummary } from 'shared';

export class ClockInDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({ nullable: true, minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number | null;

  /** Active project assigned to the employee; the whole entry books onto it. */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  /**
   * Service order of the project. Mandatory when the project has ≥1 active
   * service order; must be omitted/null otherwise.
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  /** Customer-facing description of the work performed (Tätigkeit). */
  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;
}

export class ClockOutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;
}

/**
 * Retroactive booking-target update. At least one key must be present.
 * Sending projectId re-specifies the target completely (the conditional-
 * mandatory service-order rule applies); activity is editable on its own.
 */
export class UpdateTimeEntryDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;
}

export class SplitTimeEntryDto {
  /** Split point, strictly between clockIn and clockOut. */
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  at!: string;

  /**
   * Project for the second segment. Omitted → inherits project, service
   * order, and activity of the original entry; explicit null → second
   * segment has no project.
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  /** Service order for the second segment (only with an explicit projectId). */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  /** Activity for the second segment (only with an explicit projectId). */
  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;
}

/**
 * Retroactive project booking onto an already-clocked time range. The range
 * must be fully covered by the employee's closed, non-rejected entries.
 */
export class BookProjectRangeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  from!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  to!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;
}

export interface TimeEntryDto {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  source: string;
  status: string;
  requiresApproval: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  serviceOrderId: string | null;
  serviceOrderNo: string | null;
  serviceOrderTitle: string | null;
  activity: string | null;
  summary: TimeSummary | null;
}

export interface SplitTimeEntryResult {
  first: TimeEntryDto;
  second: TimeEntryDto;
}

export interface BookProjectRangeResult {
  /** All touched and created segments, ordered by clockIn. */
  entries: TimeEntryDto[];
}

type TimeEntryWithRelations = TimeEntry & {
  project?: { code: string; name: string } | null;
  serviceOrder?: { orderNo: string; title: string } | null;
};

export function toTimeEntryDto(e: TimeEntryWithRelations): TimeEntryDto {
  return {
    id: e.id,
    employeeId: e.employeeId,
    clockIn: e.clockIn.toISOString(),
    clockOut: e.clockOut ? e.clockOut.toISOString() : null,
    source: e.source,
    status: e.status,
    requiresApproval: e.requiresApproval,
    latitude: e.latitude !== null ? Number(e.latitude) : null,
    longitude: e.longitude !== null ? Number(e.longitude) : null,
    accuracyMeters: e.accuracyMeters !== null ? Number(e.accuracyMeters) : null,
    projectId: e.projectId ?? null,
    projectCode: e.project?.code ?? null,
    projectName: e.project?.name ?? null,
    serviceOrderId: e.serviceOrderId ?? null,
    serviceOrderNo: e.serviceOrder?.orderNo ?? null,
    serviceOrderTitle: e.serviceOrder?.title ?? null,
    activity: e.activity ?? null,
    summary: e.clockOut ? summarize(e.clockIn, e.clockOut) : null,
  };
}

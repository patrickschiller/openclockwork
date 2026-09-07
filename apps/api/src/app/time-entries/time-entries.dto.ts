import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { TimeEntry } from '@prisma/client';
import { summarize, parseBreakRules, type TimeSummary } from 'shared';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DailyBlockOptionDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({
    description: 'Contractual net working minutes for one configured workday.',
  })
  dailyNetMinutes!: number;

  @ApiProperty({
    description:
      'Attendance minutes including the configured automatic break deduction.',
  })
  grossMinutes!: number;

  @ApiProperty()
  breakMinutes!: number;

  @ApiProperty()
  workdayCount!: number;
}

export class CreateDailyBlockDto {
  @ApiProperty({ example: '2026-08-13', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @Matches(DATE_ONLY, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: '08:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @Matches(HHMM, { message: 'start must be HH:mm' })
  start!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;
}

export class ClockInDto {
  @ApiPropertyOptional({
    format: 'uuid',
    deprecated: true,
    description: 'Ignored. The employee identity is always taken from the JWT.',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number | null;

  /** Active project assigned to the employee; the whole entry books onto it. */
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  /**
   * Service order of the project. Mandatory when the project has ≥1 active
   * service order; must be omitted/null otherwise.
   */
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  /** Customer-facing description of the work performed (Tätigkeit). */
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;
}

export class ClockOutDto {
  @ApiPropertyOptional({
    format: 'uuid',
    deprecated: true,
    description: 'Ignored. The employee identity is always taken from the JWT.',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number | null;
}

/**
 * Retroactive booking-target update. At least one key must be present.
 * Sending projectId re-specifies the target completely (the conditional-
 * mandatory service-order rule applies); activity is editable on its own.
 */
export class UpdateTimeEntryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
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
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  /** Service order for the second segment (only with an explicit projectId). */
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  /** Activity for the second segment (only with an explicit projectId). */
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
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

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activity?: string | null;
}

export class TimeSummaryDto implements TimeSummary {
  @ApiProperty()
  grossMinutes!: number;

  @ApiProperty()
  breakMinutes!: number;

  @ApiProperty()
  netMinutes!: number;
}

export class TimeEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ format: 'date-time' })
  clockIn!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  clockOut!: string | null;

  @ApiProperty({ enum: ['Manual', 'Pwa', 'Terminal', 'Erp', 'DailyBlock'] })
  source!: string;

  @ApiProperty({ enum: ['Open', 'Pending', 'Approved', 'Rejected'] })
  status!: string;

  @ApiProperty()
  requiresApproval!: boolean;

  @ApiProperty({ type: Number, nullable: true, minimum: -90, maximum: 90 })
  latitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: -180, maximum: 180 })
  longitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  accuracyMeters!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  terminalDistanceMeters!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 10,
    maximum: 1000,
    description:
      'Terminal geofence radius that was valid when clock-in was accepted.',
  })
  terminalRadiusMeters!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 5,
    maximum: 500,
    description:
      'Terminal maximum GPS accuracy that was valid when clock-in was accepted.',
  })
  terminalMaxAccuracyMeters!: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  positionTimestamp!: string | null;

  @ApiProperty({ type: Number, nullable: true, minimum: -90, maximum: 90 })
  clockOutLatitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: -180, maximum: 180 })
  clockOutLongitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  clockOutAccuracyMeters!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  clockOutTerminalDistanceMeters!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 10,
    maximum: 1000,
    description:
      'Terminal geofence radius that was valid when clock-out was accepted.',
  })
  clockOutTerminalRadiusMeters!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 5,
    maximum: 500,
    description:
      'Terminal maximum GPS accuracy that was valid when clock-out was accepted.',
  })
  clockOutTerminalMaxAccuracyMeters!: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  clockOutPositionTimestamp!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  terminalId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clockOutTerminalId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clockInChallengeId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clockOutChallengeId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  projectId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  projectCode!: string | null;

  @ApiProperty({ type: String, nullable: true })
  projectName!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  serviceOrderId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  serviceOrderNo!: string | null;

  @ApiProperty({ type: String, nullable: true })
  serviceOrderTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  activity!: string | null;

  @ApiProperty({ type: TimeSummaryDto, nullable: true })
  summary!: TimeSummary | null;
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
    terminalDistanceMeters:
      e.terminalDistanceMeters !== null
        ? Number(e.terminalDistanceMeters)
        : null,
    terminalRadiusMeters: e.terminalRadiusMeters ?? null,
    terminalMaxAccuracyMeters: e.terminalMaxAccuracyMeters ?? null,
    positionTimestamp: e.positionTimestamp?.toISOString() ?? null,
    clockOutLatitude:
      e.clockOutLatitude !== null ? Number(e.clockOutLatitude) : null,
    clockOutLongitude:
      e.clockOutLongitude !== null ? Number(e.clockOutLongitude) : null,
    clockOutAccuracyMeters:
      e.clockOutAccuracyMeters !== null
        ? Number(e.clockOutAccuracyMeters)
        : null,
    clockOutTerminalDistanceMeters:
      e.clockOutTerminalDistanceMeters !== null
        ? Number(e.clockOutTerminalDistanceMeters)
        : null,
    clockOutTerminalRadiusMeters: e.clockOutTerminalRadiusMeters ?? null,
    clockOutTerminalMaxAccuracyMeters:
      e.clockOutTerminalMaxAccuracyMeters ?? null,
    clockOutPositionTimestamp:
      e.clockOutPositionTimestamp?.toISOString() ?? null,
    terminalId: e.terminalId ?? null,
    clockOutTerminalId: e.clockOutTerminalId ?? null,
    clockInChallengeId: e.clockInChallengeId ?? null,
    clockOutChallengeId: e.clockOutChallengeId ?? null,
    projectId: e.projectId ?? null,
    projectCode: e.project?.code ?? null,
    projectName: e.project?.name ?? null,
    serviceOrderId: e.serviceOrderId ?? null,
    serviceOrderNo: e.serviceOrder?.orderNo ?? null,
    serviceOrderTitle: e.serviceOrder?.title ?? null,
    activity: e.activity ?? null,
    summary: e.clockOut
      ? summarize(e.clockIn, e.clockOut, parseBreakRules(e.breakRules))
      : null,
  };
}

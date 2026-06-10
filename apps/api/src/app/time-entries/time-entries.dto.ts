import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
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
}

export class ClockOutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;
}

export class UpdateTimeEntryProjectDto {
  /** New project for the entry; null removes the project reference. */
  @ApiProperty({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class SplitTimeEntryDto {
  /** Split point, strictly between clockIn and clockOut. */
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  at!: string;

  /**
   * Project for the second segment. Omitted → inherits the project of the
   * original entry; explicit null → second segment has no project.
   */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
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
  summary: TimeSummary | null;
}

export interface SplitTimeEntryResult {
  first: TimeEntryDto;
  second: TimeEntryDto;
}

type TimeEntryWithProject = TimeEntry & {
  project?: { code: string; name: string } | null;
};

export function toTimeEntryDto(e: TimeEntryWithProject): TimeEntryDto {
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
    summary: e.clockOut ? summarize(e.clockIn, e.clockOut) : null,
  };
}

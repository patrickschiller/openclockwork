import { IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { TimeEntry } from '@prisma/client';
import { summarize, type TimeSummary } from 'shared';

export class ClockInDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number | null;
}

export class ClockOutDto {
  @IsUUID()
  employeeId!: string;
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
  summary: TimeSummary | null;
}

export function toTimeEntryDto(e: TimeEntry): TimeEntryDto {
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
    summary: e.clockOut ? summarize(e.clockIn, e.clockOut) : null,
  };
}

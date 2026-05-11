import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { WorkSchedule, WorkScheduleCoreTime } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CoreTimeWindowDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @Matches(HHMM, { message: 'start must be HH:mm' })
  start!: string;

  @Matches(HHMM, { message: 'end must be HH:mm' })
  end!: string;

  @IsInt()
  @Min(0)
  @Max(127)
  weekdays!: number;
}

export class UpsertWorkScheduleDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Matches(HHMM, { message: 'frameStart must be HH:mm' })
  frameStart!: string;

  @Matches(HHMM, { message: 'frameEnd must be HH:mm' })
  frameEnd!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoreTimeWindowDto)
  coreTimes!: CoreTimeWindowDto[];
}

export class AssignToEmployeeDto {
  @IsUUID()
  employeeId!: string;
}

const TIME_MODELS = ['Teilzeit', 'Vollzeit', 'Vertrauensarbeitszeit', 'Gleitzeit'] as const;

export class BulkAssignDto {
  @IsEnum(TIME_MODELS)
  timeModel!: (typeof TIME_MODELS)[number];

  @IsOptional()
  @IsBoolean()
  overrideExisting?: boolean;
}

export interface CoreTimeWindowResponse {
  id: string;
  label: string | null;
  start: string;
  end: string;
  weekdays: number;
}

export interface WorkScheduleResponse {
  id: string;
  name: string;
  description: string | null;
  frameStart: string;
  frameEnd: string;
  isDefault: boolean;
  coreTimes: CoreTimeWindowResponse[];
  employeeCount: number;
  updatedAt: string;
}

export function toScheduleResponse(
  schedule: WorkSchedule & { coreTimes: WorkScheduleCoreTime[] },
  employeeCount: number,
): WorkScheduleResponse {
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description,
    frameStart: schedule.frameStart,
    frameEnd: schedule.frameEnd,
    isDefault: schedule.isDefault,
    coreTimes: schedule.coreTimes.map((c) => ({
      id: c.id,
      label: c.label,
      start: c.start,
      end: c.end,
      weekdays: c.weekdays,
    })),
    employeeCount,
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

export interface BulkAssignResult {
  scheduleId: string;
  assigned: number;
  skipped: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
const HHMM_PATTERN = '^([01]\\d|2[0-3]):[0-5]\\d$';

export class CoreTimeWindowDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 120, example: 'Vormittag' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @ApiProperty({ pattern: HHMM_PATTERN, example: '10:00' })
  @Matches(HHMM, { message: 'start must be HH:mm' })
  start!: string;

  @ApiProperty({ pattern: HHMM_PATTERN, example: '11:00' })
  @Matches(HHMM, { message: 'end must be HH:mm' })
  end!: string;

  @ApiProperty({
    minimum: 0,
    maximum: 127,
    description: 'Bitmask: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64. Mo–Fr = 31.',
  })
  @IsInt()
  @Min(0)
  @Max(127)
  weekdays!: number;
}

export class UpsertWorkScheduleDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ pattern: HHMM_PATTERN, example: '07:00' })
  @Matches(HHMM, { message: 'frameStart must be HH:mm' })
  frameStart!: string;

  @ApiProperty({ pattern: HHMM_PATTERN, example: '23:00' })
  @Matches(HHMM, { message: 'frameEnd must be HH:mm' })
  frameEnd!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 127,
    default: 31,
    description: 'Working-day bitmask. Mon=1, Tue=2, …, Sun=64. Mo–Fr = 31, Mo–Sa = 63.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(127)
  workingDays?: number;

  @ApiProperty({ type: [CoreTimeWindowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoreTimeWindowDto)
  coreTimes!: CoreTimeWindowDto[];
}

export class AssignToEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;
}

const TIME_MODELS = ['Teilzeit', 'Vollzeit', 'Vertrauensarbeitszeit', 'Gleitzeit'] as const;

export class BulkAssignDto {
  @ApiProperty({ enum: TIME_MODELS })
  @IsEnum(TIME_MODELS)
  timeModel!: (typeof TIME_MODELS)[number];

  @ApiPropertyOptional({ default: false })
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
  workingDays: number;
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
    workingDays: schedule.workingDays,
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

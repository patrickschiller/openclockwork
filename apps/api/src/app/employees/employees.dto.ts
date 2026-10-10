import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  Matches,
  ValidateIf,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Employee, WorkSchedule } from '@prisma/client';
import { HOLIDAY_CALENDARS, type HolidayCalendar } from 'shared';

const ROLES = ['Employee', 'Manager', 'HRAdmin'] as const;
const TIME_MODELS = [
  'Teilzeit',
  'Vollzeit',
  'Vertrauensarbeitszeit',
  'Gleitzeit',
] as const;
const BUNDESLAENDER = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;

export type EmployeeWithSchedule = Employee & {
  workSchedule: WorkSchedule | null;
};

export interface EmployeeDto {
  id: string;
  personalNo: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  timeModel: string;
  weeklyHours: number;
  annualLeaveDays: number;
  startDate: string; // YYYY-MM-DD
  overtimeOpeningBalanceMinutes: number;
  bundesland: string | null;
  holidayCalendar: string;
  holidayDates: string[];
  allowDailyBlockBooking: boolean;
  managerId: string | null;
  workScheduleId: string | null;
  workScheduleName: string | null;
  isActive: boolean;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toEmployeeDto(e: EmployeeWithSchedule | Employee): EmployeeDto {
  const ws = (e as EmployeeWithSchedule).workSchedule;
  return {
    id: e.id,
    personalNo: e.personalNo,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    role: e.role,
    timeModel: e.timeModel,
    weeklyHours: Number(e.weeklyHours),
    annualLeaveDays: Number(e.annualLeaveDays),
    startDate: dateOnly(e.startDate),
    overtimeOpeningBalanceMinutes: e.overtimeOpeningBalanceMinutes,
    bundesland: e.bundesland,
    holidayCalendar: e.holidayCalendar,
    holidayDates: e.holidayDates,
    allowDailyBlockBooking: e.allowDailyBlockBooking,
    managerId: e.managerId,
    workScheduleId: e.workScheduleId,
    workScheduleName: ws?.name ?? null,
    isActive: e.isActive,
  };
}

export class CreateEmployeeDto {
  @ApiProperty({ example: '1001', maxLength: 40 })
  @IsString()
  @MaxLength(40)
  personalNo!: string;

  @ApiProperty({ example: 'Anna', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  firstName!: string;

  @ApiProperty({ example: 'Mueller', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  lastName!: string;

  @ApiProperty({ example: 'anna.mueller@openclockwork.test', maxLength: 200 })
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 120,
    description: 'Initial password — bcrypt-hashed on the server.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;

  @ApiProperty({ enum: ROLES, example: 'Employee' })
  @IsEnum(ROLES)
  role!: (typeof ROLES)[number];

  @ApiProperty({ enum: TIME_MODELS, example: 'Vollzeit' })
  @IsEnum(TIME_MODELS)
  timeModel!: (typeof TIME_MODELS)[number];

  @ApiProperty({ example: 40, minimum: 0 })
  @IsNumber()
  @Min(0)
  weeklyHours!: number;

  @ApiProperty({ example: 30, minimum: 0 })
  @IsNumber()
  @Min(0)
  annualLeaveDays!: number;

  @ApiProperty({
    example: '2026-04-01',
    description:
      'ISO date when the employee starts; target working hours are counted from here.',
  })
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'One-time overtime carry-over in minutes (signed).',
  })
  @IsOptional()
  @IsInt()
  overtimeOpeningBalanceMinutes?: number;

  @ApiPropertyOptional({
    enum: BUNDESLAENDER,
    deprecated: true,
    description:
      'Legacy alias for a DE-XX holidayCalendar; use holidayCalendar for new clients.',
  })
  @IsOptional()
  @IsEnum(BUNDESLAENDER)
  bundesland?: (typeof BUNDESLAENDER)[number];

  @ApiPropertyOptional({
    enum: HOLIDAY_CALENDARS,
    default: 'NONE',
    description:
      'Optional holiday preset. NONE makes no public-holiday assumptions; explicit holidayDates work in every country.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(HOLIDAY_CALENDARS)
  holidayCalendar?: HolidayCalendar;

  @ApiPropertyOptional({
    type: [String],
    example: ['2026-07-01'],
    description:
      'Explicit non-working dates in YYYY-MM-DD format; supplement the selected preset.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(3660)
  @ArrayUnique()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  @IsISO8601({ strict: true }, { each: true })
  holidayDates?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Allow one self-approved fixed-duration block on a configured working day.',
  })
  @IsOptional()
  @IsBoolean()
  allowDailyBlockBooking?: boolean;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  workScheduleId?: string | null;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  personalNo?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsEnum(ROLES)
  role?: (typeof ROLES)[number];

  @ApiPropertyOptional({ enum: TIME_MODELS })
  @IsOptional()
  @IsEnum(TIME_MODELS)
  timeModel?: (typeof TIME_MODELS)[number];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weeklyHours?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  annualLeaveDays?: number;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  overtimeOpeningBalanceMinutes?: number;

  @ApiPropertyOptional({ enum: BUNDESLAENDER, deprecated: true })
  @IsOptional()
  @IsEnum(BUNDESLAENDER)
  bundesland?: (typeof BUNDESLAENDER)[number];

  @ApiPropertyOptional({
    enum: HOLIDAY_CALENDARS,
    default: 'NONE',
    description:
      'Optional holiday preset. NONE makes no public-holiday assumptions; explicit holidayDates work in every country.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(HOLIDAY_CALENDARS)
  holidayCalendar?: HolidayCalendar;

  @ApiPropertyOptional({
    type: [String],
    example: ['2026-07-01'],
    description:
      'Explicit non-working dates in YYYY-MM-DD format; supplement the selected preset.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(3660)
  @ArrayUnique()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  @IsISO8601({ strict: true }, { each: true })
  holidayDates?: string[];

  @ApiPropertyOptional({
    description:
      'Allow one self-approved fixed-duration block on a configured working day.',
  })
  @IsOptional()
  @IsBoolean()
  allowDailyBlockBooking?: boolean;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  workScheduleId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 120 })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;
}

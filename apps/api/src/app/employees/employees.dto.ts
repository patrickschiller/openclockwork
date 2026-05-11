import {
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

const ROLES = ['Employee', 'Manager', 'HRAdmin'] as const;
const TIME_MODELS = ['Teilzeit', 'Vollzeit', 'Vertrauensarbeitszeit', 'Gleitzeit'] as const;

export type EmployeeWithSchedule = Employee & { workSchedule: WorkSchedule | null };

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
    managerId: e.managerId,
    workScheduleId: e.workScheduleId,
    workScheduleName: ws?.name ?? null,
    isActive: e.isActive,
  };
}

export class CreateEmployeeDto {
  @IsString()
  @MaxLength(40)
  personalNo!: string;

  @IsString()
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MaxLength(120)
  lastName!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;

  @IsEnum(ROLES)
  role!: (typeof ROLES)[number];

  @IsEnum(TIME_MODELS)
  timeModel!: (typeof TIME_MODELS)[number];

  @IsNumber()
  @Min(0)
  weeklyHours!: number;

  @IsNumber()
  @Min(0)
  annualLeaveDays!: number;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsOptional()
  @IsInt()
  overtimeOpeningBalanceMinutes?: number;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsUUID()
  workScheduleId?: string | null;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  personalNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsEnum(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsEnum(TIME_MODELS)
  timeModel?: (typeof TIME_MODELS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  weeklyHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualLeaveDays?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsInt()
  overtimeOpeningBalanceMinutes?: number;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsUUID()
  workScheduleId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;
}

import { IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import type { EmployeeLeaveAllowance } from '@prisma/client';

export class UpsertLeaveAllowanceDto {
  @IsNumber()
  @Min(0)
  baseDays!: number;

  @IsNumber()
  @Min(0)
  carryOverDays!: number;

  @IsOptional()
  @IsISO8601()
  carryOverExpiresOn?: string | null;

  @IsNumber()
  adjustmentDays!: number;

  @IsOptional()
  @IsString()
  adjustmentReason?: string | null;
}

export interface LeaveAllowanceDto {
  id: string;
  employeeId: string;
  year: number;
  baseDays: number;
  carryOverDays: number;
  carryOverExpiresOn: string | null;
  adjustmentDays: number;
  adjustmentReason: string | null;
  totalDays: number;
  updatedAt: string;
}

export function toLeaveAllowanceDto(a: EmployeeLeaveAllowance): LeaveAllowanceDto {
  const baseDays = Number(a.baseDays);
  const carryOverDays = Number(a.carryOverDays);
  const adjustmentDays = Number(a.adjustmentDays);
  return {
    id: a.id,
    employeeId: a.employeeId,
    year: a.year,
    baseDays,
    carryOverDays,
    carryOverExpiresOn: a.carryOverExpiresOn ? a.carryOverExpiresOn.toISOString().slice(0, 10) : null,
    adjustmentDays,
    adjustmentReason: a.adjustmentReason,
    totalDays: baseDays + carryOverDays + adjustmentDays,
    updatedAt: a.updatedAt.toISOString(),
  };
}

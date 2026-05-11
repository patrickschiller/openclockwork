import type { Employee } from '@prisma/client';

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
  managerId: string | null;
  isActive: boolean;
}

export function toEmployeeDto(e: Employee): EmployeeDto {
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
    managerId: e.managerId,
    isActive: e.isActive,
  };
}

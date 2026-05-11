import { Injectable, NotFoundException } from '@nestjs/common';
import type { EmployeeLeaveAllowance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toLeaveAllowanceDto, type LeaveAllowanceDto, type UpsertLeaveAllowanceDto } from './leave-allowances.dto';

@Injectable()
export class LeaveAllowancesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(employeeId: string): Promise<LeaveAllowanceDto[]> {
    await this.assertEmployee(employeeId);
    const rows = await this.prisma.employeeLeaveAllowance.findMany({
      where: { employeeId },
      orderBy: { year: 'desc' },
    });
    return rows.map(toLeaveAllowanceDto);
  }

  async getOrDefault(employeeId: string, year: number): Promise<EmployeeLeaveAllowance> {
    const existing = await this.prisma.employeeLeaveAllowance.findUnique({
      where: { employeeId_year: { employeeId, year } },
    });
    if (existing) return existing;
    const employee = await this.assertEmployee(employeeId);
    return this.prisma.employeeLeaveAllowance.create({
      data: {
        employeeId,
        year,
        baseDays: employee.annualLeaveDays,
        carryOverDays: 0,
        adjustmentDays: 0,
      },
    });
  }

  async upsert(
    employeeId: string,
    year: number,
    dto: UpsertLeaveAllowanceDto,
  ): Promise<LeaveAllowanceDto> {
    await this.assertEmployee(employeeId);
    const carryOverExpiresOn = dto.carryOverExpiresOn ? new Date(dto.carryOverExpiresOn) : null;
    const row = await this.prisma.employeeLeaveAllowance.upsert({
      where: { employeeId_year: { employeeId, year } },
      create: {
        employeeId,
        year,
        baseDays: dto.baseDays,
        carryOverDays: dto.carryOverDays,
        carryOverExpiresOn,
        adjustmentDays: dto.adjustmentDays,
        adjustmentReason: dto.adjustmentReason ?? null,
      },
      update: {
        baseDays: dto.baseDays,
        carryOverDays: dto.carryOverDays,
        carryOverExpiresOn,
        adjustmentDays: dto.adjustmentDays,
        adjustmentReason: dto.adjustmentReason ?? null,
      },
    });
    return toLeaveAllowanceDto(row);
  }

  private async assertEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    return employee;
  }
}

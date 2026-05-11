import { Injectable } from '@nestjs/common';
import { calculateNetMinutes, calculateOvertimeMinutes } from 'shared';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { VacationBalanceService } from './vacation-balance.service';
import type { AccountDto } from './accounts.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly vacationBalance: VacationBalanceService,
  ) {}

  async account(employeeId: string): Promise<AccountDto> {
    const employee = await this.employees.getById(employeeId);
    const now = new Date();
    const year = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));

    // Sum net minutes from completed time entries YTD.
    const entries = await this.prisma.timeEntry.findMany({
      where: { employeeId, clockIn: { gte: yearStart }, clockOut: { not: null } },
      select: { clockIn: true, clockOut: true },
    });
    let netMinutesYtd = 0;
    for (const e of entries) {
      if (!e.clockOut) continue;
      const gross = Math.floor((e.clockOut.getTime() - e.clockIn.getTime()) / 60_000);
      netMinutesYtd += calculateNetMinutes(gross);
    }

    // Soll only counts from the employee's startDate; opening balance is added on top.
    const overtime = calculateOvertimeMinutes({
      startDate: employee.startDate,
      year,
      now,
      weeklyHours: Number(employee.weeklyHours),
      netMinutesYtd,
      openingBalanceMinutes: employee.overtimeOpeningBalanceMinutes,
    });

    const balance = await this.vacationBalance.compute(employeeId, year);

    return {
      employeeId,
      overtimeMinutes: overtime.overtimeMinutes,
      vacationDaysTotal: balance.totalEntitlement,
      vacationDaysUsed: balance.approvedDays,
      vacationDaysRemaining: balance.remainingDays,
      asOf: now.toISOString(),
    };
  }
}

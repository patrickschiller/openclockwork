import { Injectable } from '@nestjs/common';
import { calculateNetMinutes, calculateOvertimeMinutes } from 'shared';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { VacationBalanceService } from './vacation-balance.service';
import type { AccountDto } from './accounts.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly vacationBalance: VacationBalanceService,
    private readonly schedules: WorkSchedulesService,
  ) {}

  async account(employeeId: string): Promise<AccountDto> {
    const employee = await this.employees.getById(employeeId);
    const schedule = await this.schedules.resolveForEmployee(employeeId);
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

    // Soll counts from the employee's startDate using their working-day mask
    // and Bundesland-specific holiday calendar.
    const overtime = calculateOvertimeMinutes({
      startDate: employee.startDate,
      year,
      now,
      weeklyHours: Number(employee.weeklyHours),
      netMinutesYtd,
      openingBalanceMinutes: employee.overtimeOpeningBalanceMinutes,
      workingDays: schedule.workingDays,
      holidayProvider: schedule.holidayProvider,
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

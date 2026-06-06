import { Injectable } from '@nestjs/common';
import {
  calculateNetMinutes,
  calculateOvertimeMinutes,
  calculateVacationDays,
  calculateWorkingDays,
} from 'shared';
import type { HolidayProvider } from 'shared';
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

    // Soll-Befreiung: Vacation (approved) + Sickness + Training count as
    // excused working days — their absence on a workday is not a deficit.
    // Flextime/Gleittage are intentionally NOT excused: that's what makes
    // them drain the overtime account.
    const sollFrom = employee.startDate.getTime() > yearStart.getTime()
      ? new Date(Date.UTC(
          employee.startDate.getUTCFullYear(),
          employee.startDate.getUTCMonth(),
          employee.startDate.getUTCDate(),
        ))
      : yearStart;
    const excusedDays = await this.excusedWorkingDays(
      employeeId,
      sollFrom,
      now,
      schedule.workingDays,
      schedule.holidayProvider,
    );

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
      excusedDays,
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

  /**
   * Working days within [from, to] that should be excused from Soll because
   * the employee is on approved vacation, sick, or in training. Gleittage are
   * intentionally excluded — they must drain the overtime account.
   */
  private async excusedWorkingDays(
    employeeId: string,
    from: Date,
    to: Date,
    workingDays: number,
    holidayProvider: HolidayProvider,
  ): Promise<number> {
    if (from.getTime() > to.getTime()) return 0;
    const [absences, vacationRequests] = await Promise.all([
      this.prisma.absence.findMany({
        where: {
          employeeId,
          kind: { in: ['Sickness', 'Training'] },
          from: { lte: to },
          to: { gte: from },
        },
        select: { from: true, to: true },
      }),
      this.prisma.request.findMany({
        where: {
          employeeId,
          type: 'Vacation',
          workflowState: 'Approved',
          from: { lte: to },
          to: { gte: from },
        },
        select: { from: true, to: true, halfDayStart: true, halfDayEnd: true },
      }),
    ]);
    let total = 0;
    for (const a of absences) {
      const start = a.from.getTime() < from.getTime() ? from : a.from;
      const end = a.to.getTime() > to.getTime() ? to : a.to;
      total += calculateWorkingDays(start, end, { holidayProvider, workingDays });
    }
    for (const v of vacationRequests) {
      // Only credit half a day when the half-day boundary falls inside our
      // window — if we clipped that end off, it would otherwise be lost.
      const clippedStart = v.from.getTime() < from.getTime() ? from : v.from;
      const clippedEnd = v.to.getTime() > to.getTime() ? to : v.to;
      const halfDayStart = v.halfDayStart && clippedStart.getTime() === v.from.getTime();
      const halfDayEnd = v.halfDayEnd && clippedEnd.getTime() === v.to.getTime();
      total += calculateVacationDays(clippedStart, clippedEnd, {
        holidayProvider,
        workingDays,
        halfDayStart,
        halfDayEnd,
      });
    }
    return total;
  }
}

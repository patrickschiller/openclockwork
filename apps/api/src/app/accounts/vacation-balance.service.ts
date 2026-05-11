import { Injectable } from '@nestjs/common';
import { calculateWorkingDays } from 'shared';
import { LeaveAllowancesService } from '../leave-allowances/leave-allowances.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import type { VacationBalanceDto } from './accounts.dto';

const PENDING_STATES = ['Submitted', 'PendingSubstitute', 'PendingManager', 'PendingHr'] as const;

@Injectable()
export class VacationBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allowances: LeaveAllowancesService,
    private readonly schedules: WorkSchedulesService,
  ) {}

  async compute(employeeId: string, year: number): Promise<VacationBalanceDto> {
    const allowance = await this.allowances.getOrDefault(employeeId, year);
    const schedule = await this.schedules.resolveForEmployee(employeeId);
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

    const requests = await this.prisma.request.findMany({
      where: {
        employeeId,
        type: 'Vacation',
        from: { lte: yearEnd },
        to: { gte: yearStart },
      },
      select: { workflowState: true, from: true, to: true, calculatedDays: true },
    });

    let approvedDays = 0;
    let pendingDays = 0;
    for (const r of requests) {
      const days = Number(r.calculatedDays) > 0
        ? Number(r.calculatedDays)
        : calculateWorkingDays(r.from, r.to, {
            workingDays: schedule.workingDays,
            holidayProvider: schedule.holidayProvider,
          });
      if (r.workflowState === 'Approved') approvedDays += days;
      else if ((PENDING_STATES as readonly string[]).includes(r.workflowState)) pendingDays += days;
    }

    const baseDays = Number(allowance.baseDays);
    const carryOverDays = Number(allowance.carryOverDays);
    const adjustmentDays = Number(allowance.adjustmentDays);
    const totalEntitlement = baseDays + carryOverDays + adjustmentDays;

    return {
      employeeId,
      year,
      baseDays,
      carryOverDays,
      adjustmentDays,
      totalEntitlement,
      approvedDays,
      pendingDays,
      remainingDays: Math.max(0, totalEntitlement - approvedDays - pendingDays),
      carryOverExpiresOn: allowance.carryOverExpiresOn
        ? allowance.carryOverExpiresOn.toISOString().slice(0, 10)
        : null,
      adjustmentReason: allowance.adjustmentReason,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { detectCoreTimeViolations } from 'shared';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';

export interface ViolationDto {
  timeEntryId: string;
  employeeId: string;
  kind: string;
  boundary: string;
  deltaMinutes: number;
  windowLabel?: string;
}

@Injectable()
export class ViolationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly schedules: WorkSchedulesService,
  ) {}

  async list(employeeId: string, from?: Date, to?: Date): Promise<ViolationDto[]> {
    const employee = await this.employees.getById(employeeId);
    if (employee.timeModel === 'Vertrauensarbeitszeit') return [];

    const schedule = await this.schedules.resolveForEmployee(employeeId);
    if (schedule.coreWindows.length === 0) return [];

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        employeeId,
        clockIn:
          from && to
            ? { gte: from, lte: to }
            : from
              ? { gte: from }
              : to
                ? { lte: to }
                : undefined,
      },
      orderBy: { clockIn: 'asc' },
    });

    const out: ViolationDto[] = [];
    for (const e of entries) {
      const violations = detectCoreTimeViolations(e.clockIn, e.clockOut, schedule.coreWindows);
      for (const v of violations) {
        out.push({
          timeEntryId: e.id,
          employeeId,
          kind: v.kind,
          boundary: v.boundary,
          deltaMinutes: v.deltaMinutes,
          windowLabel: v.windowLabel,
        });
      }
    }
    return out;
  }
}

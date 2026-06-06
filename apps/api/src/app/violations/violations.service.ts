import { Injectable } from '@nestjs/common';
import { detectCoreTimeViolationsForDay } from 'shared';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';

export interface ViolationDto {
  employeeId: string;
  /** Day on which the violation occurred (YYYY-MM-DD, local). */
  date: string;
  kind: 'LateArrival' | 'EarlyDeparture' | 'MidDayGap';
  /** The core-time window, formatted as "HH:mm–HH:mm". */
  boundary: string;
  /** Length of the uncovered gap in minutes. */
  deltaMinutes: number;
  windowLabel?: string;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

    // Group entries by their local-time date.
    const byDay = new Map<string, { day: Date; entries: typeof entries }>();
    for (const e of entries) {
      const key = dateKey(e.clockIn);
      if (!byDay.has(key)) byDay.set(key, { day: e.clockIn, entries: [] });
      byDay.get(key)!.entries.push(e);
    }

    // Core-time violations are only ever assessed retroactively. Today's
    // core windows may not have elapsed yet — evaluating the current day
    // would flag every employee the moment they clock in in the morning.
    // Detection therefore runs strictly up to and including yesterday.
    const todayKey = dateKey(new Date());

    const out: ViolationDto[] = [];
    for (const [key, group] of byDay) {
      if (key >= todayKey) continue;
      const violations = detectCoreTimeViolationsForDay(
        group.entries,
        schedule.coreWindows,
        group.day,
      );
      for (const v of violations) {
        out.push({
          employeeId,
          date: key,
          kind: v.kind,
          boundary: v.boundary,
          deltaMinutes: v.deltaMinutes,
          windowLabel: v.windowLabel,
        });
      }
    }
    // Stable ordering: newest day first, then by window start.
    out.sort((a, b) => b.date.localeCompare(a.date) || a.boundary.localeCompare(b.boundary));
    return out;
  }
}

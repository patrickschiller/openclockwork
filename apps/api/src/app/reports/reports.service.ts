import { BadRequestException, Injectable } from '@nestjs/common';
import { summarize } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  type WorkingTimeReportEmployeeDto,
  type WorkingTimeReportDto,
  type WorkingTimeReportQueryDto,
} from './reports.dto';

const DAY_MS = 86_400_000;
const MAX_REPORT_DAYS = 366;

interface LocalDay {
  date: Date;
  dayNumber: number;
}

function parseLocalDay(value: string): LocalDay {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new BadRequestException(`Invalid calendar date: ${value}`);
  }
  return { date, dayNumber: Date.UTC(year, month - 1, day) / DAY_MS };
}

/** Booking day in the deployment's configured local timezone. */
function localDate(value: Date): string {
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async workingTimeEmployees(): Promise<WorkingTimeReportEmployeeDto[]> {
    return this.prisma.employee.findMany({
      where: {
        isActive: true,
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async workingTimes(
    query: WorkingTimeReportQueryDto,
  ): Promise<WorkingTimeReportDto> {
    const from = parseLocalDay(query.from);
    const to = parseLocalDay(query.to);
    const inclusiveDays = to.dayNumber - from.dayNumber + 1;
    if (inclusiveDays <= 0) {
      throw new BadRequestException(
        'The report start date must not be after its end date',
      );
    }
    if (inclusiveDays > MAX_REPORT_DAYS) {
      throw new BadRequestException(
        `The report range must not exceed ${MAX_REPORT_DAYS} days`,
      );
    }
    const toExclusive = new Date(
      to.date.getFullYear(),
      to.date.getMonth(),
      to.date.getDate() + 1,
    );

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        employeeId: query.employeeId,
        clockIn: { gte: from.date, lt: toExclusive },
        clockOut: { not: null },
        status: { not: 'Rejected' },
      },
      orderBy: [{ clockIn: 'asc' }, { employeeId: 'asc' }],
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    const rows = entries.map((entry) => {
      const summary = summarize(entry.clockIn, entry.clockOut as Date);
      return {
        id: entry.id,
        employeeId: entry.employeeId,
        employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
        date: localDate(entry.clockIn),
        clockIn: entry.clockIn.toISOString(),
        clockOut: (entry.clockOut as Date).toISOString(),
        status: entry.status,
        ...summary,
      };
    });

    return {
      from: query.from,
      to: query.to,
      rows,
      totals: rows.reduce(
        (totals, row) => ({
          grossMinutes: totals.grossMinutes + row.grossMinutes,
          breakMinutes: totals.breakMinutes + row.breakMinutes,
          netMinutes: totals.netMinutes + row.netMinutes,
        }),
        { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 },
      ),
    };
  }
}

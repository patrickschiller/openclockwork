import { BadRequestException, Injectable } from '@nestjs/common';
import { summarize, parseBreakRules } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { InstallationService } from '../installation/installation.service';
import { calculateCaptureSummaries } from '../time-entries/capture-summary';
import {
  type WorkingTimeReportEmployeeDto,
  type WorkingTimeReportDto,
  type WorkingTimeReportQueryDto,
  type SoloReportQueryDto,
  type SoloReportDto,
  type SoloReportRowDto,
} from './reports.dto';

const DAY_MS = 86_400_000;
const MAX_REPORT_DAYS = 366;

interface LocalDay {
  date: Date;
  dayNumber: number;
}

function reportLocation(
  label: string | null,
  latitude: { toString(): string } | null,
  longitude: { toString(): string } | null,
  accuracyMeters: { toString(): string } | null,
) {
  if (label === null && latitude === null && longitude === null) return null;
  return {
    label,
    latitude: latitude === null ? null : Number(latitude),
    longitude: longitude === null ? null : Number(longitude),
    accuracyMeters: accuracyMeters === null ? null : Number(accuracyMeters),
  };
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly installation: InstallationService,
  ) {}

  async solo(
    actorId: string,
    query: SoloReportQueryDto,
  ): Promise<SoloReportDto> {
    await this.installation.requireOwner(actorId);
    const from = parseLocalDay(query.from);
    const to = parseLocalDay(query.to);
    const days = to.dayNumber - from.dayNumber + 1;
    if (days < 1 || days > MAX_REPORT_DAYS)
      throw new BadRequestException(
        `The report range must be between 1 and ${MAX_REPORT_DAYS} days`,
      );
    if (
      query.unassigned === 'true' &&
      (query.customerId || query.projectId || query.serviceOrderId)
    )
      throw new BadRequestException(
        'Unassigned time cannot be filtered by customer, project, or service order',
      );
    const end = new Date(
      to.date.getFullYear(),
      to.date.getMonth(),
      to.date.getDate() + 1,
    );
    const filter: Prisma.TimeEntryWhereInput = {
      employeeId: actorId,
      voidedAt: null,
      status: { not: 'Rejected' },
      project: query.customerId ? { customerId: query.customerId } : undefined,
      projectId:
        query.unassigned === 'true'
          ? null
          : (query.projectId ??
            (query.unassigned === 'false' ? { not: null } : undefined)),
      serviceOrderId: query.serviceOrderId,
      billable:
        query.billable === undefined ? undefined : query.billable === 'true',
    };
    // Repeatable read makes the statement and its allocation basis one snapshot.
    return this.prisma.$transaction(
      async (tx) => {
        await this.installation.requireOwner(actorId, tx);
        const entries = await tx.timeEntry.findMany({
          where: {
            ...filter,
            clockIn: { lt: end },
            clockOut: { gt: from.date },
          },
          orderBy: [{ clockIn: 'asc' }, { id: 'asc' }],
          include: {
            project: {
              select: {
                id: true,
                code: true,
                name: true,
                customerId: true,
                customer: { select: { name: true } },
              },
            },
            serviceOrder: { select: { orderNo: true, title: true } },
          },
        });
        const groupIds = [
          ...new Set(
            entries.flatMap((entry) =>
              entry.captureGroupId ? [entry.captureGroupId] : [],
            ),
          ),
        ];
        const siblings = groupIds.length
          ? await tx.timeEntry.findMany({
              where: {
                employeeId: actorId,
                captureGroupId: { in: groupIds },
                voidedAt: null,
                status: { not: 'Rejected' },
                clockOut: { not: null },
              },
            })
          : [];
        const summaries = calculateCaptureSummaries([
          ...new Map(
            [...entries, ...siblings].map((entry) => [entry.id, entry]),
          ).values(),
        ]);
        const rows: SoloReportRowDto[] = [];
        for (const entry of entries) {
          const summary = summaries.get(entry.id);
          if (!entry.clockOut || !summary) continue;
          const duration = entry.clockOut.getTime() - entry.clockIn.getTime();
          if (duration <= 0) continue;
          const clippedEnd = Math.min(entry.clockOut.getTime(), end.getTime());
          let cursor = new Date(
            Math.max(entry.clockIn.getTime(), from.date.getTime()),
          );
          while (cursor.getTime() < clippedEnd) {
            const midnight = new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate() + 1,
            );
            const rowEnd = Math.min(clippedEnd, midnight.getTime());
            const ratio = (rowEnd - cursor.getTime()) / duration;
            const grossMinutes = summary.grossMinutes * ratio;
            const breakMinutes = summary.breakMinutes * ratio;
            const netMinutes = grossMinutes - breakMinutes;
            rows.push({
              id: entry.id,
              date: localDate(cursor),
              clockIn: cursor.toISOString(),
              clockOut: new Date(rowEnd).toISOString(),
              customerId: entry.project?.customerId ?? null,
              customerName: entry.project?.customer?.name ?? null,
              projectId: entry.projectId,
              projectCode: entry.project?.code ?? null,
              projectName: entry.project?.name ?? null,
              serviceOrderId: entry.serviceOrderId,
              orderNo: entry.serviceOrder?.orderNo ?? null,
              orderTitle: entry.serviceOrder?.title ?? null,
              activity: entry.activity,
              billable: entry.billable,
              grossMinutes,
              breakMinutes,
              netMinutes,
              billableNetMinutes: entry.billable ? netMinutes : 0,
            });
            cursor = new Date(rowEnd);
          }
        }
        const openTimerCount = await tx.timeEntry.count({
          where: { ...filter, clockIn: { lt: end }, clockOut: null },
        });
        return {
          from: query.from,
          to: query.to,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timeDefinition: 'net_working_time' as const,
          rows,
          totals: rows.reduce(
            (totals, row) => ({
              grossMinutes: totals.grossMinutes + row.grossMinutes,
              breakMinutes: totals.breakMinutes + row.breakMinutes,
              netMinutes: totals.netMinutes + row.netMinutes,
              billableNetMinutes:
                totals.billableNetMinutes + row.billableNetMinutes,
            }),
            {
              grossMinutes: 0,
              breakMinutes: 0,
              netMinutes: 0,
              billableNetMinutes: 0,
            },
          ),
          openTimerCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async soloCsv(actorId: string, query: SoloReportQueryDto): Promise<string> {
    const report = await this.solo(actorId, query);
    const rows: Array<Array<string | number | boolean | null>> = [
      ['working_time_zone', report.timeZone],
      [
        'time_definition',
        'gross interval minutes - allocated break minutes = net working minutes; billable uses net minutes',
      ],
      ['period_from', report.from, 'period_to', report.to],
      [
        'date',
        'customer',
        'project_code',
        'project',
        'service_order',
        'service_order_title',
        'activity',
        'billable',
        'gross_minutes',
        'break_minutes',
        'net_minutes',
        'billable_net_minutes',
      ],
      ...report.rows.map((row) => [
        row.date,
        row.customerName,
        row.projectCode,
        row.projectName,
        row.orderNo,
        row.orderTitle,
        row.activity,
        row.billable,
        row.grossMinutes,
        row.breakMinutes,
        row.netMinutes,
        row.billableNetMinutes,
      ]),
    ];
    return (
      '\uFEFF' +
      rows.map((row) => row.map(csvCell).join(';')).join('\r\n') +
      '\r\n'
    );
  }

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
    const includeLocations = query.includeLocations === 'true';
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
        voidedAt: null,
      },
      orderBy: [{ clockIn: 'asc' }, { employeeId: 'asc' }],
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    const rows = entries.map((entry) => {
      const summary = summarize(
        entry.clockIn,
        entry.clockOut as Date,
        parseBreakRules(entry.breakRules),
      );
      return {
        id: entry.id,
        employeeId: entry.employeeId,
        employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
        date: localDate(entry.clockIn),
        clockIn: entry.clockIn.toISOString(),
        clockOut: (entry.clockOut as Date).toISOString(),
        status: entry.status,
        ...(includeLocations
          ? {
              clockInLocation: reportLocation(
                entry.terminalLocationLabel,
                entry.latitude,
                entry.longitude,
                entry.accuracyMeters,
              ),
              clockOutLocation: reportLocation(
                entry.clockOutTerminalLocationLabel,
                entry.clockOutLatitude,
                entry.clockOutLongitude,
                entry.clockOutAccuracyMeters,
              ),
            }
          : {}),
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

/** Quote every cell and neutralize spreadsheet formulas, including whitespace prefixes. */
function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r\n]/.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

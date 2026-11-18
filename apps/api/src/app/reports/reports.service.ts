import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { InstallationService } from '../installation/installation.service';
import { calculateCaptureSummaries } from '../time-entries/capture-summary';
import {
  type WorkingTimeReportEmployeeDto,
  type WorkingTimeReportRowDto,
  type WorkingTimeReportDto,
  type WorkingTimeReportQueryDto,
  type WorkingTimePdfQueryDto,
  type SoloReportQueryDto,
  type SoloReportDto,
  type SoloReportRowDto,
} from './reports.dto';
import { renderWorkingTimePdf } from './working-time-pdf';
import {
  compareWorkingTime,
  EXCESS_THRESHOLD_MINUTES,
} from './working-time-comparison';

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

  async workingTimeEmployees(
    actorId: string,
  ): Promise<WorkingTimeReportEmployeeDto[]> {
    return this.prisma.$transaction(
      (tx) => this.scopedEmployees(actorId, undefined, tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async workingTimes(
    actorId: string,
    query: WorkingTimeReportQueryDto,
  ): Promise<WorkingTimeReportDto> {
    return this.prisma.$transaction(
      (tx) => this.buildWorkingTimes(actorId, query, tx),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }

  /** Re-read the active server-side actor inside the report snapshot. */
  private async scopedEmployees(
    actorId: string,
    selectedIds: string[] | undefined,
    tx: Prisma.TransactionClient,
    hrOnly = false,
  ): Promise<WorkingTimeReportEmployeeDto[]> {
    const settings = await tx.installationSettings.findUnique({
      where: { id: 1 },
    });
    if (settings?.mode === 'Solo')
      throw new ForbiddenException('Team reports are disabled in Solo mode');
    const actor = await tx.employee.findUnique({
      where: { id: actorId },
      select: { id: true, role: true, isActive: true },
    });
    if (
      !actor?.isActive ||
      !['HRAdmin', 'Manager'].includes(actor.role) ||
      (hrOnly && actor.role !== 'HRAdmin')
    ) {
      throw new ForbiddenException(
        'Working-time reports require an active authorized actor',
      );
    }
    const scope: Prisma.EmployeeWhereInput =
      actor.role === 'HRAdmin'
        ? {}
        : { OR: [{ id: actor.id }, { managerId: actor.id }] };
    const employees = await tx.employee.findMany({
      where: { ...scope, ...(selectedIds ? { id: { in: selectedIds } } : {}) },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    // Validate IDs independently of time entries: even an empty foreign report
    // is forbidden, and mixtures never silently drop inaccessible employees.
    if (selectedIds && employees.length !== selectedIds.length) {
      if (actor.role === 'Manager')
        throw new ForbiddenException(
          'Employee selection is outside your report scope',
        );
      throw new BadRequestException('One or more employees do not exist');
    }
    return employees;
  }

  async workingTimesPdf(
    actorId: string,
    query: WorkingTimePdfQueryDto,
  ): Promise<Buffer> {
    const input = await this.prisma.$transaction(
      async (tx) => {
        await this.scopedEmployees(actorId, undefined, tx, true);
        const report = await this.buildWorkingTimes(
          actorId,
          { ...query, includeLocations: 'false' },
          tx,
        );
        const from = parseLocalDay(query.from).date;
        const to = parseLocalDay(query.to).date;
        to.setDate(to.getDate() + 1);
        const selectedIds = query.employeeId
          ? [query.employeeId]
          : query.employeeIds;
        const periodEntries: Prisma.TimeEntryWhereInput = {
          clockIn: { lt: to },
          OR: [{ clockOut: { gt: from } }, { clockOut: null }],
          voidedAt: null,
          status: { not: 'Rejected' },
        };
        const employees = await tx.employee.findMany({
          where: selectedIds
            ? { id: { in: selectedIds } }
            : { timeEntries: { some: periodEntries } },
          select: {
            id: true,
            personalNo: true,
            firstName: true,
            lastName: true,
            _count: {
              select: {
                timeEntries: {
                  where: { ...periodEntries, clockOut: null },
                },
              },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        });
        if (selectedIds && employees.length !== selectedIds.length) {
          throw new BadRequestException('One or more employees do not exist');
        }
        return {
          from: report.from,
          to: report.to,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          generatedAt: new Date(),
          locale: query.locale ?? 'de',
          employees: employees.map(({ _count, ...employee }) => ({
            ...employee,
            openEntryCount: _count.timeEntries,
            rows: report.rows.filter((row) => row.employeeId === employee.id),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return renderWorkingTimePdf(input);
  }

  private async buildWorkingTimes(
    actorId: string,
    query: WorkingTimeReportQueryDto,
    tx: Prisma.TransactionClient,
  ): Promise<WorkingTimeReportDto> {
    if (query.employeeId && query.employeeIds) {
      throw new BadRequestException(
        'employeeId and employeeIds cannot be combined',
      );
    }
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

    const employees = await this.scopedEmployees(
      actorId,
      query.employeeId ? [query.employeeId] : query.employeeIds,
      tx,
    );
    const employeeIds = employees.map((employee) => employee.id);
    // Query by interval overlap, not booking start date. Open timers never
    // contribute provisional minutes to this closed-entry period comparison.
    const [entries, contracts, requests, absences, openCounts] =
      await Promise.all([
        tx.timeEntry.findMany({
          where: {
            employeeId: { in: employeeIds },
            clockIn: { lt: toExclusive },
            clockOut: { gt: from.date },
            status: { in: ['Pending', 'Approved'] },
            voidedAt: null,
          },
          orderBy: [{ clockIn: 'asc' }, { employeeId: 'asc' }, { id: 'asc' }],
          include: {
            employee: { select: { firstName: true, lastName: true } },
          },
        }),
        tx.employeeContractPeriod.findMany({
          where: {
            employeeId: { in: employeeIds },
            effectiveFrom: { lte: new Date(`${query.to}T00:00:00.000Z`) },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: new Date(`${query.from}T00:00:00.000Z`) } },
            ],
          },
          orderBy: [
            { effectiveFrom: 'desc' },
            { revision: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
        }),
        tx.request.findMany({
          where: {
            employeeId: { in: employeeIds },
            type: { in: ['Vacation', 'SpecialLeave'] },
            workflowState: 'Approved',
            cancelledAt: null,
            from: {
              lt: new Date(
                Date.UTC(
                  to.date.getFullYear(),
                  to.date.getMonth(),
                  to.date.getDate() + 1,
                ),
              ),
            },
            to: { gte: new Date(`${query.from}T00:00:00.000Z`) },
          },
        }),
        tx.absence.findMany({
          where: {
            employeeId: { in: employeeIds },
            kind: { in: ['Sickness', 'Training'] },
            from: { lte: new Date(`${query.to}T00:00:00.000Z`) },
            to: { gte: new Date(`${query.from}T00:00:00.000Z`) },
          },
        }),
        tx.timeEntry.groupBy({
          by: ['employeeId'],
          where: {
            employeeId: { in: employeeIds },
            clockIn: { lt: toExclusive },
            clockOut: null,
            status: { not: 'Rejected' },
            voidedAt: null,
          },
          _count: { _all: true },
        }),
      ]);

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
            captureGroupId: { in: groupIds },
            employeeId: {
              in: [...new Set(entries.map((entry) => entry.employeeId))],
            },
            voidedAt: null,
            status: { in: ['Pending', 'Approved'] },
            clockOut: { not: null },
          },
        })
      : [];
    const summaries = calculateCaptureSummaries([
      ...new Map(
        [...entries, ...siblings].map((entry) => [entry.id, entry]),
      ).values(),
    ]);
    const rows: WorkingTimeReportRowDto[] = [];
    for (const entry of entries) {
      const summary = summaries.get(entry.id);
      if (!entry.clockOut || !summary) continue;
      const duration = entry.clockOut.getTime() - entry.clockIn.getTime();
      if (duration <= 0) continue;
      const clippedEnd = Math.min(
        entry.clockOut.getTime(),
        toExclusive.getTime(),
      );
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
        // Keep exact timestamp minutes, including historical ungrouped entries,
        // while taking captured break deductions from the complete group.
        const grossMinutes = (rowEnd - cursor.getTime()) / 60_000;
        const breakMinutes = summary.breakMinutes * ratio;
        rows.push({
          id: entry.id,
          employeeId: entry.employeeId,
          employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
          date: localDate(cursor),
          clockIn: cursor.toISOString(),
          clockOut: new Date(rowEnd).toISOString(),
          status: entry.status,
          ...(includeLocations
            ? {
                // Synthetic midnight/period edges are not physical clock
                // events and must not inherit an unrelated GPS observation.
                clockInLocation:
                  cursor.getTime() === entry.clockIn.getTime()
                    ? reportLocation(
                        entry.terminalLocationLabel,
                        entry.latitude,
                        entry.longitude,
                        entry.accuracyMeters,
                      )
                    : null,
                clockOutLocation:
                  rowEnd === entry.clockOut.getTime()
                    ? reportLocation(
                        entry.clockOutTerminalLocationLabel,
                        entry.clockOutLatitude,
                        entry.clockOutLongitude,
                        entry.clockOutAccuracyMeters,
                      )
                    : null,
              }
            : {}),
          grossMinutes,
          breakMinutes,
          netMinutes: grossMinutes - breakMinutes,
        });
        cursor = new Date(rowEnd);
      }
    }
    // Splitting a long entry must not move its later days ahead of another
    // employee's earlier booking rows.
    rows.sort(
      (left, right) =>
        left.clockIn.localeCompare(right.clockIn) ||
        left.employeeId.localeCompare(right.employeeId) ||
        left.id.localeCompare(right.id),
    );
    const actualByEmployee = new Map<string, number>();
    for (const row of rows) {
      actualByEmployee.set(
        row.employeeId,
        (actualByEmployee.get(row.employeeId) ?? 0) + row.netMinutes,
      );
    }
    const openByEmployee = new Map(
      openCounts.map((row) => [row.employeeId, row._count._all]),
    );
    const comparisons = employees.map((employee) =>
      compareWorkingTime({
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        from: query.from,
        to: query.to,
        snapshots: contracts.filter(
          (period) => period.employeeId === employee.id,
        ),
        excused: [...requests, ...absences].filter(
          (range) => range.employeeId === employee.id,
        ),
        actualMinutes: actualByEmployee.get(employee.id) ?? 0,
        openEntryCount: openByEmployee.get(employee.id) ?? 0,
      }),
    );

    return {
      from: query.from,
      to: query.to,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeDefinition: 'net_working_time',
      excessThresholdMinutes: EXCESS_THRESHOLD_MINUTES,
      comparisons,
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

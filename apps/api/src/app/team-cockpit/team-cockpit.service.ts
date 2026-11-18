import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { toRequestDto } from '../requests/requests.dto';
import type { RequestDto } from '../requests/requests.dto';
import type { BookableProjectDto } from '../projects/projects.dto';
import { calculateCaptureSummaries } from '../time-entries/capture-summary';
import { frameApprovalState } from '../time-entries/time-entry-approvals.service';
import {
  attendanceForEmployee,
  localDayKey,
  nextAttendanceBoundary,
} from './attendance';
import {
  assertCockpitActor,
  assertCockpitEmployee,
  assertProxyTarget,
  cockpitScope,
} from './team-scope';
import type {
  CockpitHistoryDto,
  CockpitHistoryItemDto,
  CockpitHistoryQueryDto,
  CockpitProxyEventDto,
  TeamCockpitDto,
} from './team-cockpit.dto';

const DAY_MS = 86_400_000;
const REQUEST_EMPLOYEE = {
  employee: { select: { firstName: true, lastName: true } },
} as const;
const HISTORY_ENTRY_INCLUDE = {
  project: { select: { code: true, name: true } },
  serviceOrder: { select: { orderNo: true, title: true } },
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isActive: true,
      managerId: true,
      manager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
        },
      },
    },
  },
} as const;
type Kind = CockpitHistoryItemDto['kind'];
const RANK: Record<Kind, number> = { Absence: 0, Request: 1, TimeEntry: 2 };
interface Cursor {
  at: Date;
  kind: Kind;
  id: string;
}
function day(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Invalid calendar date');
  return parsed;
}
function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const object = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const at = new Date(object.at);
    if (
      !Number.isFinite(at.getTime()) ||
      at.toISOString() !== object.at ||
      !Object.hasOwn(RANK, object.kind) ||
      typeof object.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        object.id,
      )
    )
      throw new Error();
    return { at, kind: object.kind, id: object.id };
  } catch {
    throw new BadRequestException('Invalid history cursor');
  }
}
function cursorWhere(
  field: 'clockIn' | 'from',
  kind: Kind,
  cursor: Cursor | null,
): Record<string, unknown> {
  if (!cursor) return {};
  return {
    OR: [
      { [field]: { lt: cursor.at } },
      ...(RANK[kind] < RANK[cursor.kind]
        ? [{ [field]: cursor.at }]
        : RANK[kind] === RANK[cursor.kind]
          ? [{ [field]: cursor.at, id: { lt: cursor.id } }]
          : []),
    ],
  };
}
const mini = (employee: {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}) => ({
  id: employee.id,
  firstName: employee.firstName,
  lastName: employee.lastName,
  isActive: employee.isActive,
});
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class TeamCockpitService {
  constructor(private readonly prisma: PrismaService) {}
  /** The HTTP interface always uses the server clock; fixtures may spy this seam. */
  now(): Date {
    return new Date();
  }

  async overview(identity: JwtUser): Promise<TeamCockpitDto> {
    return this.prisma.$transaction(
      async (tx) => {
        const actor = await assertCockpitActor(tx, identity),
          now = this.now(),
          today = localDayKey(now);
        const todayUtc = day(today),
          tomorrowUtc = new Date(todayUtc.getTime() + DAY_MS);
        const employees = await tx.employee.findMany({
          where: { AND: [cockpitScope(actor), { isActive: true }] },
          include: {
            workSchedule: {
              include: { coreTimes: { orderBy: { start: 'asc' } } },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        });
        const ids = employees.map((employee) => employee.id);
        const [contracts, requests, absences, opens, defaults] =
          await Promise.all([
            tx.employeeContractPeriod.findMany({
              where: {
                employeeId: { in: ids },
                effectiveFrom: { lte: todayUtc },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: todayUtc } }],
              },
            }),
            tx.request.findMany({
              where: {
                employeeId: { in: ids },
                type: { in: ['Vacation', 'HomeOffice', 'SpecialLeave'] },
                status: 'Approved',
                workflowState: 'Approved',
                cancelledAt: null,
                from: { lt: tomorrowUtc },
                to: { gte: todayUtc },
              },
            }),
            tx.absence.findMany({
              where: {
                employeeId: { in: ids },
                from: { lte: todayUtc },
                to: { gte: todayUtc },
              },
            }),
            tx.timeEntry.findMany({
              where: {
                employeeId: { in: ids },
                clockOut: null,
                voidedAt: null,
                status: { not: 'Rejected' },
              },
              include: {
                project: { select: { name: true } },
                serviceOrder: { select: { title: true } },
              },
            }),
            tx.workSchedule.findMany({
              where: { isDefault: true },
              include: { coreTimes: { orderBy: { start: 'asc' } } },
            }),
          ]);
        const rows = employees.map((employee) =>
          attendanceForEmployee({
            employee,
            now,
            contracts: contracts.filter((p) => p.employeeId === employee.id),
            schedule:
              employee.workSchedule ??
              (defaults.length === 1 ? defaults[0] : null),
            requests: requests.filter((r) => r.employeeId === employee.id),
            absences: absences.filter((a) => a.employeeId === employee.id),
            openEntry: opens.find((e) => e.employeeId === employee.id) ?? null,
          }),
        );
        return {
          generatedAt: now.toISOString(),
          today,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          nextRefreshAt: nextAttendanceBoundary(now, rows).toISOString(),
          scope: actor.role === 'HRAdmin' ? 'Organisation' : 'Team',
          employees: rows,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async approvalRequests(identity: JwtUser): Promise<RequestDto[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const actor = await assertCockpitActor(tx, identity);
        const rows = await tx.request.findMany({
          where: {
            type: 'TimeAdjustment',
            workflowState: {
              in: [
                'Submitted',
                'PendingSubstitute',
                'PendingManager',
                'PendingHr',
              ],
            },
            employee: {
              AND: [
                cockpitScope(actor),
                { isActive: true, NOT: { id: actor.id } },
              ],
            },
          },
          include: REQUEST_EMPLOYEE,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return rows.map(toRequestDto);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async bookingTargets(
    employeeId: string,
    identity: JwtUser,
  ): Promise<BookableProjectDto[]> {
    return this.prisma.$transaction(
      async (tx) => {
        await assertProxyTarget(tx, identity, employeeId);
        const rows = await tx.project.findMany({
          where: {
            isActive: true,
            assignments: { some: { employeeId } },
            OR: [{ customerId: null }, { customer: { isActive: true } }],
          },
          orderBy: { code: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            customerId: true,
            customer: { select: { name: true } },
            defaultBillable: true,
            serviceOrders: {
              where: { isActive: true },
              orderBy: { orderNo: 'asc' },
              select: {
                id: true,
                orderNo: true,
                title: true,
                defaultBillable: true,
              },
            },
          },
        });
        return rows.map(({ customer, ...project }) => ({
          ...project,
          customerName: customer?.name ?? null,
        }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async history(
    employeeId: string,
    query: CockpitHistoryQueryDto,
    identity: JwtUser,
  ): Promise<CockpitHistoryDto> {
    const fromUtc = day(query.from),
      toUtc = day(query.to);
    const days = (toUtc.getTime() - fromUtc.getTime()) / DAY_MS + 1;
    if (days < 1 || days > 1830)
      throw new BadRequestException(
        'History range must be 1 to 1830 inclusive calendar days',
      );
    const limit = query.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new BadRequestException('History page size must be 1 to 200');
    const cursor = decodeCursor(query.cursor);
    const fromLocal = new Date(`${query.from}T00:00:00`),
      toLocal = new Date(`${query.to}T00:00:00`);
    toLocal.setDate(toLocal.getDate() + 1);
    return this.prisma.$transaction(
      async (tx) => {
        const { employee } = await assertCockpitEmployee(
            tx,
            identity,
            employeeId,
          ),
          now = this.now();
        const [entries, requests, absences] = await Promise.all([
          tx.timeEntry.findMany({
            where: {
              AND: [
                {
                  employeeId,
                  clockIn: { lt: toLocal },
                  OR: [
                    { clockOut: { gt: fromLocal } },
                    ...(now > fromLocal
                      ? [{ clockOut: null, clockIn: { lte: now } }]
                      : []),
                  ],
                },
                cursorWhere('clockIn', 'TimeEntry', cursor),
              ],
            },
            include: HISTORY_ENTRY_INCLUDE,
            orderBy: [{ clockIn: 'desc' }, { id: 'desc' }],
            take: limit + 1,
          }),
          tx.request.findMany({
            where: {
              AND: [
                {
                  employeeId,
                  OR: [
                    {
                      type: 'TimeAdjustment',
                      from: { lt: toLocal },
                      to: { gt: fromLocal },
                    },
                    {
                      type: { not: 'TimeAdjustment' },
                      from: { lte: toUtc },
                      to: { gte: fromUtc },
                    },
                  ],
                },
                cursorWhere('from', 'Request', cursor),
              ],
            },
            include: REQUEST_EMPLOYEE,
            orderBy: [{ from: 'desc' }, { id: 'desc' }],
            take: limit + 1,
          }),
          tx.absence.findMany({
            where: {
              AND: [
                { employeeId, from: { lte: toUtc }, to: { gte: fromUtc } },
                cursorWhere('from', 'Absence', cursor),
              ],
            },
            orderBy: [{ from: 'desc' }, { id: 'desc' }],
            take: limit + 1,
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
                employeeId,
                captureGroupId: { in: groupIds },
                clockOut: { not: null },
                voidedAt: null,
                status: { not: 'Rejected' },
              },
            })
          : [];
        const summaries = calculateCaptureSummaries([
          ...new Map(
            [...entries, ...siblings].map((entry) => [entry.id, entry]),
          ).values(),
        ]);
        type Stamped = { item: CockpitHistoryItemDto; at: Date };
        const common = {
          employeeId,
          halfDayStart: false,
          halfDayEnd: false,
          projectName: null,
          serviceOrderTitle: null,
          grossMinutes: null,
          breakMinutes: null,
          netMinutes: null,
          requiresApproval: false,
          reason: null,
          workflowState: null,
          request: null,
          proxyActions: [],
        };
        const stamped: Stamped[] = [
          ...entries.map((entry) => {
            const summary = summaries.get(entry.id);
            return {
              at: entry.clockIn,
              item: {
                ...common,
                kind: 'TimeEntry' as const,
                id: entry.id,
                from: entry.clockIn.toISOString(),
                to: entry.clockOut?.toISOString() ?? null,
                allDay: false,
                classification: 'WorkingTime',
                status: entry.voidedAt ? 'Voided' : entry.status,
                workflowState: entry.requiresApproval
                  ? frameApprovalState(entry)
                  : null,
                projectName: entry.project?.name ?? null,
                serviceOrderTitle: entry.serviceOrder?.title ?? null,
                grossMinutes: entry.clockOut
                  ? (entry.clockOut.getTime() - entry.clockIn.getTime()) /
                    60_000
                  : null,
                breakMinutes: entry.clockOut
                  ? (summary?.breakMinutes ?? null)
                  : null,
                netMinutes: entry.clockOut
                  ? (summary?.netMinutes ?? null)
                  : null,
                requiresApproval: entry.requiresApproval,
                reason: entry.note,
              },
            };
          }),
          ...requests.map((request) => ({
            at: request.from,
            item: {
              ...common,
              kind: 'Request' as const,
              id: request.id,
              from:
                request.type === 'TimeAdjustment'
                  ? request.from.toISOString()
                  : dateKey(request.from),
              to:
                request.type === 'TimeAdjustment'
                  ? request.to.toISOString()
                  : dateKey(request.to),
              allDay: request.type !== 'TimeAdjustment',
              classification: request.type,
              status: request.workflowState,
              workflowState: request.workflowState,
              halfDayStart: request.halfDayStart,
              halfDayEnd: request.halfDayEnd,
              requiresApproval: request.requiresApproval,
              reason: request.reason,
              request: toRequestDto(request),
            },
          })),
          ...absences.map((absence) => ({
            at: absence.from,
            item: {
              ...common,
              kind: 'Absence' as const,
              id: absence.id,
              from: dateKey(absence.from),
              to: dateKey(absence.to),
              allDay: true,
              classification: absence.kind,
              status: 'Recorded',
            },
          })),
        ];
        stamped.sort(
          (a, b) =>
            b.at.getTime() - a.at.getTime() ||
            RANK[b.item.kind] - RANK[a.item.kind] ||
            b.item.id.localeCompare(a.item.id),
        );
        const selected = stamped.slice(0, limit);
        const audits = selected.length
          ? await tx.teamProxyAudit.findMany({
              where: {
                employeeId,
                OR: selected.map(({ item }) => ({
                  resourceKind: item.kind,
                  resourceId: item.id,
                })),
              },
              orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            })
          : [];
        const proxyEvents = new Map<string, CockpitProxyEventDto[]>();
        for (const audit of audits) {
          const values = audit.values as Record<string, unknown>;
          const actor = values?.actor as Record<string, unknown> | undefined;
          const actorName =
            actor &&
            typeof actor.firstName === 'string' &&
            typeof actor.lastName === 'string'
              ? `${actor.firstName} ${actor.lastName}`
              : null;
          const key = `${audit.resourceKind}:${audit.resourceId}`;
          const event = {
            id: audit.id,
            action: audit.action,
            actorId:
              audit.actorId ??
              (typeof actor?.id === 'string' ? actor.id : null),
            actorName,
            at: audit.occurredAt.toISOString(),
            reason: audit.reason,
          };
          proxyEvents.set(key, [...(proxyEvents.get(key) ?? []), event]);
        }
        const last = selected.at(-1);
        return {
          employee: mini(employee),
          from: query.from,
          to: query.to,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          generatedAt: now.toISOString(),
          items: selected.map(({ item }) => ({
            ...item,
            proxyActions: proxyEvents.get(`${item.kind}:${item.id}`) ?? [],
          })),
          nextCursor:
            stamped.length > limit && last
              ? Buffer.from(
                  JSON.stringify({
                    at: last.at.toISOString(),
                    kind: last.item.kind,
                    id: last.item.id,
                  }),
                ).toString('base64url')
              : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

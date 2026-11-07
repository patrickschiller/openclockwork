import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type Request, type TimeEntry } from '@prisma/client';
import { parseBreakRules, requiresSpecialApproval } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { calculateCaptureSummaries } from '../time-entries/capture-summary';
import {
  toTimeEntryDto,
  type TimeEntryDto,
} from '../time-entries/time-entries.dto';

interface TargetBinding {
  targetTimeEntryId?: string | null;
  expectedTargetRevision?: number | null;
}

@Injectable()
export class TimeAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: WorkSchedulesService,
  ) {}

  async assertTeam(tx: Prisma.TransactionClient): Promise<void> {
    const settings = await tx.installationSettings.findUnique({
      where: { id: 1 },
    });
    if (settings?.mode === 'Solo')
      throw new ForbiddenException(
        'Team correction requests are unavailable in Solo mode',
      );
  }

  async targets(
    employeeId: string,
    from?: Date,
    to?: Date,
  ): Promise<TimeEntryDto[]> {
    if (
      (from && !Number.isFinite(+from)) ||
      (to && !Number.isFinite(+to)) ||
      (from && to && from > to)
    )
      throw new BadRequestException('Invalid target date range');
    await this.assertTeam(this.prisma);
    const rows = await this.prisma.timeEntry.findMany({
      where: {
        employeeId,
        voidedAt: null,
        clockOut: { not: null },
        status: { in: ['Pending', 'Approved'] },
        OR: [{ approvalMode: null }, { approvalMode: { not: 'Solo' } }],
      },
      include: {
        project: { select: { code: true, name: true } },
        serviceOrder: { select: { orderNo: true, title: true } },
      },
      orderBy: [{ clockIn: 'desc' }, { id: 'asc' }],
    });
    const summaries = calculateCaptureSummaries(rows);
    return rows
      .filter(
        (row) =>
          (!from || (row.clockOut && row.clockOut > from)) &&
          (!to || row.clockIn < to),
      )
      .map((row) => ({
        ...toTimeEntryDto(row),
        summary: summaries.get(row.id) ?? null,
      }));
  }

  async snapshot(
    tx: Prisma.TransactionClient,
    entry: TimeEntry,
  ): Promise<Prisma.InputJsonObject> {
    const group = entry.captureGroupId
      ? await tx.timeEntry.findMany({
          where: {
            employeeId: entry.employeeId,
            captureGroupId: entry.captureGroupId,
          },
        })
      : [entry];
    const summaries = calculateCaptureSummaries(group);
    const summary = summaries.get(entry.id);
    const captureSummary = [...summaries.values()].reduce(
      (sum, item) => ({
        grossMinutes: sum.grossMinutes + item.grossMinutes,
        breakMinutes: sum.breakMinutes + item.breakMinutes,
        netMinutes: sum.netMinutes + item.netMinutes,
      }),
      { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 },
    );
    return {
      id: entry.id,
      revision: entry.revision,
      clockIn: entry.clockIn.toISOString(),
      clockOut: entry.clockOut?.toISOString() ?? null,
      status: entry.status,
      source: entry.source,
      projectId: entry.projectId,
      serviceOrderId: entry.serviceOrderId,
      activity: entry.activity,
      note: entry.note,
      billable: entry.billable,
      breakRules: parseBreakRules(entry.breakRules),
      captureGroupId: entry.captureGroupId,
      approvalMode: entry.approvalMode,
      requiresApproval: entry.requiresApproval,
      frameApproverId: entry.frameApproverId,
      frameApprovedRevision: entry.frameApprovedRevision,
      bookingDate: entry.bookingDate?.toISOString() ?? null,
      summary: summary ? { ...summary } : null,
      captureSummary: { ...captureSummary },
    };
  }

  async validate(
    tx: Prisma.TransactionClient,
    employeeId: string,
    from: Date,
    to: Date,
    binding: TargetBinding,
    original?: Request,
  ) {
    await this.assertTeam(tx);
    const targetId = binding.targetTimeEntryId ?? null;
    const revision = binding.expectedTargetRevision ?? null;
    if (
      (targetId === null) !== (revision === null) ||
      (revision !== null && (!Number.isInteger(revision) || revision < 0))
    )
      throw new BadRequestException(
        'Correction target and expected revision must be supplied together',
      );
    if (
      original &&
      (targetId !== original.targetTimeEntryId ||
        revision !== original.expectedTargetRevision)
    )
      throw new BadRequestException(
        'The correction target and original revision are immutable; cancel and create a new request',
      );
    let target: TimeEntry | null = null;
    let before: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (targetId) {
      target = await tx.timeEntry.findUnique({ where: { id: targetId } });
      if (!target || target.employeeId !== employeeId)
        throw new ForbiddenException(
          'The correction target must be your own time entry',
        );
      if (
        target.voidedAt ||
        !target.clockOut ||
        target.status === 'Open' ||
        target.status === 'Rejected' ||
        target.approvalMode === 'Solo'
      )
        throw new ConflictException(
          'Target must be a closed, non-voided Team entry that is not rejected',
        );
      if (target.revision !== revision)
        throw new ConflictException(
          'Correction target changed; cancel and create a new request from its current version',
        );
      if (to.getTime() > Date.now())
        throw new BadRequestException(
          'Corrected working time cannot be in the future',
        );
      if (original) {
        if (
          !original.targetTimeEntryBefore ||
          typeof original.targetTimeEntryBefore !== 'object' ||
          Array.isArray(original.targetTimeEntryBefore)
        )
          throw new ConflictException(
            'Original correction snapshot is unavailable',
          );
        before = original.targetTimeEntryBefore as Prisma.InputJsonObject;
      } else before = await this.snapshot(tx, target);
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: { manager: true },
      });
      if (
        !employee.isActive ||
        !employee.manager?.isActive ||
        employee.manager.role !== 'Manager' ||
        employee.managerId === employeeId
      )
        throw new ConflictException(
          'An active assigned manager is required; ask HR to correct the manager assignment',
        );
    }
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from)
      throw new BadRequestException(
        'TimeAdjustment "to" must be after a valid "from"',
      );
    const overlap = await tx.timeEntry.findFirst({
      where: {
        employeeId,
        voidedAt: null,
        status: { not: 'Rejected' },
        ...(targetId ? { id: { not: targetId } } : {}),
        clockIn: { lt: to },
        OR: [{ clockOut: null }, { clockOut: { gt: from } }],
      },
      select: { id: true },
    });
    if (overlap)
      throw new ConflictException(
        'Time adjustment overlaps another time entry for this employee',
      );
    const schedule = await this.schedules.resolveForEmployee(employeeId);
    return {
      targetTimeEntryId: targetId,
      expectedTargetRevision: revision,
      targetTimeEntryBefore: before,
      requiresApproval: requiresSpecialApproval(from, to, schedule.frame),
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    request: Request,
    actorId: string,
    requiresApproval: boolean,
  ): Promise<TimeEntry> {
    let row: TimeEntry;
    let before: Prisma.InputJsonObject | null = null;
    if (request.targetTimeEntryId) {
      const target = await tx.timeEntry.findUniqueOrThrow({
        where: { id: request.targetTimeEntryId },
      });
      before = await this.snapshot(tx, target);
      const changed = await tx.timeEntry.updateMany({
        where: {
          id: target.id,
          employeeId: request.employeeId,
          revision: request.expectedTargetRevision ?? -1,
          voidedAt: null,
          clockOut: { not: null },
          status: { in: ['Pending', 'Approved'] },
        },
        data: {
          clockIn: request.from,
          clockOut: request.to,
          revision: { increment: 1 },
          status: 'Approved',
          requiresApproval,
          frameApproverId: null,
          frameApprovedRevision: null,
          ...(target.source === 'DailyBlock' ? { bookingDate: null } : {}),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Correction target changed before application',
        );
      row = await tx.timeEntry.findUniqueOrThrow({ where: { id: target.id } });
    } else {
      const schedule = await this.schedules.resolveForEmployee(
        request.employeeId,
      );
      row = await tx.timeEntry.create({
        data: {
          employeeId: request.employeeId,
          clockIn: request.from,
          clockOut: request.to,
          source: 'Manual',
          approvalMode: 'Team',
          breakRules: schedule.breakRules,
          status: 'Approved',
          requiresApproval: false,
        },
      });
    }
    await tx.timeEntryAudit.create({
      data: {
        timeEntryId: row.id,
        requestId: request.id,
        actorId,
        action: request.targetTimeEntryId
          ? 'FrameRequestCorrected'
          : 'RequestMissingBookingAdded',
        before: before ?? Prisma.DbNull,
        after: await this.snapshot(tx, row),
        reason: request.reason,
      },
    });
    return row;
  }
}

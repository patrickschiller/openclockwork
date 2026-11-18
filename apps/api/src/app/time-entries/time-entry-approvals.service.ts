import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Employee } from '@prisma/client';
import type { JwtUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { toTimeEntryDto } from './time-entries.dto';
import {
  type DecideTimeEntryApprovalDto,
  type EntryApprovalState,
  type TimeEntryApprovalDto,
  type TimeEntryApprovalEventDto,
} from './time-entry-approvals.dto';

const APPROVAL_INCLUDE = {
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
type ReviewEntry = Prisma.TimeEntryGetPayload<{
  include: typeof APPROVAL_INCLUDE;
}>;

function validManager(row: ReviewEntry): boolean {
  const manager = row.employee.manager;
  return (
    !!manager?.isActive &&
    manager.role === 'Manager' &&
    manager.id !== row.employeeId
  );
}

export function frameApprovalState(row: ReviewEntry): EntryApprovalState {
  if (row.voidedAt) return 'Voided';
  if (!row.clockOut || row.status === 'Open') return 'Open';
  if (row.status === 'Approved') return 'Approved';
  if (row.status === 'Rejected') return 'Rejected';
  if (!validManager(row)) return 'BlockedManager';
  return row.frameApprovedRevision === row.revision &&
    row.frameApproverId === row.employee.managerId
    ? 'PendingHr'
    : 'PendingManager';
}

@Injectable()
export class TimeEntryApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  private async assertTeam(tx: Prisma.TransactionClient): Promise<void> {
    const installation = await tx.installationSettings.findUnique({
      where: { id: 1 },
    });
    if (installation?.mode === 'Solo')
      throw new ForbiddenException(
        'Team time-entry approvals are disabled in Solo mode',
      );
  }

  private async actor(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Employee> {
    const actor = await tx.employee.findUnique({ where: { id } });
    if (!actor?.isActive)
      throw new ForbiddenException('Active employee required');
    return actor;
  }

  private assertReviewAccess(
    row: ReviewEntry,
    actor: Employee,
    allowOwner: boolean,
  ): void {
    if (allowOwner && actor.id === row.employeeId) return;
    if (actor.id === row.employeeId)
      throw new ForbiddenException('You cannot review your own time entry');
    if (actor.role === 'HRAdmin') return;
    if (actor.role === 'Manager' && row.employee.managerId === actor.id) return;
    throw new ForbiddenException(
      'Only the assigned manager or HR may review this time entry',
    );
  }

  private assertApplicable(row: ReviewEntry): void {
    if (row.approvalMode === 'Solo' || !row.requiresApproval)
      throw new ConflictException(
        'This time entry does not require Team frame approval',
      );
  }

  private dto(row: ReviewEntry, actor: Employee): TimeEntryApprovalDto {
    const state = frameApprovalState(row);
    return {
      entry: toTimeEntryDto(row),
      revision: row.revision,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      managerId: row.employee.managerId,
      managerName: row.employee.manager
        ? `${row.employee.manager.firstName} ${row.employee.manager.lastName}`
        : null,
      state,
      canDecide:
        row.employee.isActive &&
        actor.id !== row.employeeId &&
        ((state === 'PendingManager' &&
          actor.role === 'Manager' &&
          row.employee.managerId === actor.id) ||
          (state === 'PendingHr' &&
            actor.role === 'HRAdmin' &&
            row.frameApproverId !== actor.id)),
    };
  }

  async list(
    actorId: string,
    scope = 'review',
  ): Promise<TimeEntryApprovalDto[]> {
    if (scope !== 'review' && scope !== 'own')
      throw new BadRequestException('Invalid approval scope');
    return this.prisma.$transaction(async (tx) => {
      await this.assertTeam(tx);
      const actor = await this.actor(tx, actorId);
      if (
        scope === 'review' &&
        actor.role !== 'Manager' &&
        actor.role !== 'HRAdmin'
      )
        throw new ForbiddenException('Manager or HR access required');
      const rows = await tx.timeEntry.findMany({
        where: {
          AND: [
            { OR: [{ approvalMode: null }, { approvalMode: { not: 'Solo' } }] },
            {
              OR: [
                { requiresApproval: true },
                { auditEvents: { some: { action: { startsWith: 'Frame' } } } },
              ],
            },
          ],
          ...(scope === 'own'
            ? { employeeId: actor.id }
            : {
                employeeId: { not: actor.id },
                employee: {
                  isActive: true,
                  ...(actor.role === 'Manager' ? { managerId: actor.id } : {}),
                },
              }),
        },
        include: APPROVAL_INCLUDE,
        orderBy: [{ clockIn: 'desc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.dto(row, actor));
    });
  }

  async history(
    id: string,
    user: JwtUser,
  ): Promise<TimeEntryApprovalEventDto[]> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertTeam(tx);
      const actor = await this.actor(tx, user.id);
      const row = await tx.timeEntry.findUnique({
        where: { id },
        include: APPROVAL_INCLUDE,
      });
      if (!row) throw new NotFoundException('Time entry not found');
      this.assertReviewAccess(row, actor, true);
      // A split may move the original ID wholly inside the frame. Its old
      // decisions and invalidation remain reviewable, even though it no
      // longer needs approval. Solo archives must remain inaccessible.
      if (row.approvalMode === 'Solo')
        throw new ForbiddenException(
          'Solo entries have no Team approval history',
        );
      const events = await tx.timeEntryAudit.findMany({
        where: { timeEntryId: id, action: { startsWith: 'Frame' } },
        include: { actor: { select: { firstName: true, lastName: true } } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });
      return events.map((event) => ({
        id: event.id,
        actorId: event.actorId,
        action: event.action,
        reason: event.reason,
        actorName: event.actor
          ? `${event.actor.firstName} ${event.actor.lastName}`
          : null,
        occurredAt: event.occurredAt.toISOString(),
      }));
    });
  }

  async decide(
    id: string,
    dto: DecideTimeEntryApprovalDto,
    user: JwtUser,
  ): Promise<TimeEntryApprovalDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Same serialization order as every booking/correction and installation
      // mode change. Row locks also serialize concurrent role/manager changes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
      await this.assertTeam(tx);
      const initial = await tx.timeEntry.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException('Time entry not found');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.employeeId}, 0))`;
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${initial.employeeId}::uuid FOR SHARE`;
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: initial.employeeId },
      });
      const ids = [
        ...new Set(
          [user.id, employee.id, employee.managerId].filter(
            (value): value is string => !!value,
          ),
        ),
      ].sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" IN (${Prisma.join(ids.map((value) => Prisma.sql`${value}::uuid`))}) ORDER BY "id" FOR SHARE`,
      );
      const actor = await this.actor(tx, user.id);
      const row = await tx.timeEntry.findUniqueOrThrow({
        where: { id },
        include: APPROVAL_INCLUDE,
      });
      this.assertReviewAccess(row, actor, false);
      this.assertApplicable(row);
      if (!row.employee.isActive)
        throw new ForbiddenException('Employee account is inactive');
      if (row.revision !== dto.revision)
        throw new ConflictException(
          'Time entry changed; reload before deciding',
        );
      const view = this.dto(row, actor);
      if (
        (dto.stage === 'Manager' && actor.role !== 'Manager') ||
        (dto.stage === 'HR' && actor.role !== 'HRAdmin')
      )
        throw new ForbiddenException('Wrong approval role');
      if (
        !view.canDecide ||
        view.state !==
          (dto.stage === 'Manager' ? 'PendingManager' : 'PendingHr')
      )
        throw new ConflictException(
          'Time entry is not awaiting this approval stage',
        );
      const note = dto.note?.trim() || null;
      if (dto.outcome === 'Reject' && !note)
        throw new BadRequestException('A rejection reason is required');
      const approveManager =
        dto.stage === 'Manager' && dto.outcome === 'Approve';
      const data: Prisma.TimeEntryUncheckedUpdateInput = {
        revision: { increment: 1 },
        status:
          dto.outcome === 'Reject'
            ? 'Rejected'
            : dto.stage === 'HR'
              ? 'Approved'
              : 'Pending',
        ...(approveManager
          ? {
              frameApproverId: actor.id,
              frameApprovedRevision: row.revision + 1,
            }
          : {}),
      };
      const changed = await tx.timeEntry.updateMany({
        where: {
          id,
          revision: dto.revision,
          status: 'Pending',
          clockOut: { not: null },
          voidedAt: null,
        },
        data,
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Time entry changed; reload before deciding',
        );
      const updated = await tx.timeEntry.findUniqueOrThrow({
        where: { id },
        include: APPROVAL_INCLUDE,
      });
      const action =
        dto.stage === 'Manager'
          ? dto.outcome === 'Approve'
            ? 'FrameManagerApproved'
            : 'FrameManagerRejected'
          : dto.outcome === 'Approve'
            ? 'FrameHrConfirmed'
            : 'FrameHrRejected';
      await tx.timeEntryAudit.create({
        data: {
          timeEntryId: id,
          actorId: actor.id,
          action,
          reason: note,
          before: {
            revision: row.revision,
            state: view.state,
            status: row.status,
          },
          after: {
            revision: updated.revision,
            state: frameApprovalState(updated),
            status: updated.status,
          },
        },
      });
      return this.dto(updated, actor);
    });
    this.events.broadcast('time-entry:updated', {
      id,
      employeeId: result.entry.employeeId,
      clockOut: result.entry.clockOut,
    });
    return result;
  }
}

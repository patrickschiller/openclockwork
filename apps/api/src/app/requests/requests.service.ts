import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Request,
  type RequestEventKind,
  type RequestType,
} from '@prisma/client';
import {
  calculateVacationDays,
  calculateWorkingDays,
  deriveStatus,
  nextState,
  type WorkflowEvent,
} from 'shared';
import { VacationBalanceService } from '../accounts/vacation-balance.service';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestNotificationService } from '../notifications/request-notification.service';
import { EventsGateway } from '../events/events.gateway';
import { TimeAdjustmentsService } from './time-adjustments.service';
import type {
  TimeEntryAuditDto,
  TimeEntryDto,
} from '../time-entries/time-entries.dto';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import {
  toRequestDto,
  type BulkResult,
  type CreateRequestDto,
  type CreateVacationDto,
  type RequestDto,
  type RequestEventDto,
  type UpdateDraftRequestDto,
} from './requests.dto';

export interface ListRequestsFilter {
  employeeId?: string;
  status?: string;
  workflowState?: string;
  approverId?: string;
  currentApproverId?: string;
  substituteId?: string;
}

const employeeInclude = {
  employee: { select: { firstName: true, lastName: true } },
} as const;
type RequestWithEmployee = Prisma.RequestGetPayload<{
  include: typeof employeeInclude;
}>;

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly notifications: RequestNotificationService,
    private readonly vacationBalance: VacationBalanceService,
    private readonly schedules: WorkSchedulesService,
    private readonly adjustments: TimeAdjustmentsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async list(
    filter: ListRequestsFilter,
    actorId: string,
  ): Promise<RequestDto[]> {
    const where: Prisma.RequestWhereInput = {};
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.status)
      where.status = filter.status as Prisma.RequestWhereInput['status'];
    if (filter.workflowState)
      where.workflowState =
        filter.workflowState as Prisma.RequestWhereInput['workflowState'];
    if (filter.approverId) where.approverId = filter.approverId;
    if (filter.currentApproverId)
      where.currentApproverId = filter.currentApproverId;
    if (filter.substituteId) where.substituteId = filter.substituteId;
    const rows = await this.prisma.request.findMany({
      where: { AND: [where, await this.visibilityWhere(actorId)] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: employeeInclude,
    });
    return rows.map(toRequestDto);
  }

  async getById(id: string, actorId: string): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertCanView(request, actorId);
    return toRequestDto(request);
  }

  async events(id: string, actorId: string): Promise<RequestEventDto[]> {
    const request = await this.assertRequest(id);
    await this.assertCanView(request, actorId);
    const rows = await this.prisma.requestEvent.findMany({
      where: { requestId: id },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map((e) => ({
      id: e.id,
      requestId: e.requestId,
      at: e.occurredAt.toISOString(),
      actorId: e.actorId,
      kind: e.kind,
      note: e.note,
    }));
  }

  // Creation and revision deliberately share validation. Serializing per employee
  // keeps simultaneous resubmissions/creations from spending the same balance or
  // passing the same overlap check. No request is deleted/recreated on revision.
  async create(dto: CreateRequestDto): Promise<RequestDto> {
    return this.createValidated(dto.type, dto);
  }

  async createVacation(dto: CreateVacationDto): Promise<RequestDto> {
    return this.createValidated('Vacation', dto);
  }

  private async lockEmployee(
    tx: Prisma.TransactionClient,
    employeeId: string,
  ): Promise<void> {
    // Same order as TimeEntriesService, terminal booking, #41 decisions and
    // installation mode changes: global → employee advisory → employee row.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))`;
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId}::uuid FOR NO KEY UPDATE`;
  }

  private async createValidated(
    type: RequestType,
    dto: CreateVacationDto,
  ): Promise<RequestDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, dto.employeeId);
      const values = await this.validateValues(type, dto, tx);
      const request = await tx.request.create({
        data: {
          ...values,
          employeeId: dto.employeeId,
          type,
          status: 'Submitted',
          workflowState: values.substituteId
            ? 'PendingSubstitute'
            : 'PendingManager',
        },
        include: employeeInclude,
      });
      await tx.requestEvent.create({
        data: {
          requestId: request.id,
          kind: 'Submitted',
          actorId: dto.employeeId,
        },
      });
      return request;
    });
    this.notifications.notifyTransitioned(created, 'Submitted', dto.employeeId);
    return toRequestDto(created);
  }

  async updateDraft(
    id: string,
    actorId: string,
    dto: UpdateDraftRequestDto,
    resubmit: boolean,
  ): Promise<RequestDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, actorId);
      const request = await tx.request.findUnique({ where: { id } });
      if (!request) throw new NotFoundException(`Request ${id} not found`);
      if (request.employeeId !== actorId) {
        throw new ForbiddenException('Only the requester may edit or resubmit');
      }
      if (
        request.workflowState !== 'Draft' ||
        request.updatedAt.toISOString() !==
          new Date(dto.expectedUpdatedAt).toISOString()
      ) {
        throw new ConflictException(
          'Request changed or is no longer a draft; reload before editing',
        );
      }
      const values = await this.validateValues(
        request.type,
        {
          ...dto,
          employeeId: actorId,
          targetTimeEntryId:
            dto.targetTimeEntryId === undefined
              ? request.targetTimeEntryId
              : dto.targetTimeEntryId,
          expectedTargetRevision:
            dto.expectedTargetRevision === undefined
              ? request.expectedTargetRevision
              : dto.expectedTargetRevision,
        },
        tx,
        id,
        request,
      );
      const data: Prisma.RequestUncheckedUpdateInput = {
        ...values,
        // A saved draft is not assigned until it is actually submitted.
        currentApproverId: resubmit ? values.currentApproverId : null,
        workflowState: resubmit
          ? nextState('Draft', 'submit', {
              hasSubstitute: !!values.substituteId,
            })
          : 'Draft',
        status: 'Submitted', // legacy display status; workflowState gates writes
        approverId: null,
        substituteAcceptedAt: null,
        hrConfirmedAt: null,
        cancelledAt: null,
        decidedAt: null,
        // Keep the revision reason visible until submission; history always keeps it.
        decisionNote: resubmit ? null : request.decisionNote,
      };
      const saved = await this.updateVersion(tx, request, data);
      if (resubmit) {
        await tx.requestEvent.create({
          data: { requestId: id, kind: 'Resubmitted', actorId },
        });
      }
      return saved;
    });
    if (resubmit)
      this.notifications.notifyTransitioned(updated, 'Resubmitted', actorId);
    return toRequestDto(updated);
  }

  private async validateValues(
    type: RequestType,
    dto: CreateVacationDto,
    tx: Prisma.TransactionClient,
    excludeRequestId?: string,
    original?: Request,
  ) {
    const employee = await this.employees.getById(dto.employeeId);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to < from
    ) {
      throw new BadRequestException('"to" must be on/after a valid "from"');
    }
    const vacation = type === 'Vacation';
    if (
      type !== 'TimeAdjustment' &&
      (dto.targetTimeEntryId != null || dto.expectedTargetRevision != null)
    )
      throw new BadRequestException(
        'Only TimeAdjustment supports a correction target',
      );
    if (vacation && from.getUTCFullYear() !== to.getUTCFullYear()) {
      throw new BadRequestException(
        'Vacation must lie within a single calendar year — split into two requests',
      );
    }
    if (!vacation && (dto.substituteId || dto.halfDayStart || dto.halfDayEnd)) {
      throw new BadRequestException(
        'Substitute and half-days are only supported for Vacation',
      );
    }
    const substituteId = vacation ? (dto.substituteId ?? null) : null;
    if (substituteId) {
      const substitute = await tx.employee.findUnique({
        where: { id: substituteId },
      });
      if (substituteId === employee.id || !substitute?.isActive) {
        throw new BadRequestException(
          'Substitute must be a different active employee',
        );
      }
    }
    const schedule = await this.schedules.resolveForEmployee(employee.id);
    const halfDayStart = vacation && !!dto.halfDayStart;
    const halfDayEnd = vacation && !!dto.halfDayEnd;
    const options = {
      workingDays: schedule.workingDays,
      holidayProvider: schedule.holidayProvider,
      halfDayStart,
      halfDayEnd,
    };
    const calculatedDays = vacation
      ? calculateVacationDays(from, to, options)
      : calculateWorkingDays(from, to, options);
    if (vacation && calculatedDays <= 0)
      throw new BadRequestException('Vacation range covers no working days');
    await this.assertNoActiveOverlap(
      employee.id,
      from,
      to,
      tx,
      excludeRequestId,
      type === 'TimeAdjustment',
    );
    let requiresApproval = false;
    let targetValues:
      | Awaited<ReturnType<TimeAdjustmentsService['validate']>>
      | undefined;
    if (type === 'TimeAdjustment') {
      if (to <= from)
        throw new BadRequestException(
          'TimeAdjustment "to" must be after "from"',
        );
      targetValues = await this.adjustments.validate(
        tx,
        employee.id,
        from,
        to,
        dto,
        original,
      );
      requiresApproval = targetValues.requiresApproval;
    }
    if (vacation) {
      const balance = await this.vacationBalance.compute(
        employee.id,
        from.getUTCFullYear(),
        excludeRequestId,
        tx,
      );
      if (balance.remainingDays < calculatedDays) {
        throw new ConflictException(
          `Not enough vacation days remaining (${balance.remainingDays} < ${calculatedDays})`,
        );
      }
    }
    return {
      ...(targetValues ?? {
        targetTimeEntryId: null,
        expectedTargetRevision: null,
        targetTimeEntryBefore: Prisma.DbNull,
      }),
      from,
      to,
      reason: dto.reason ?? null,
      calculatedDays,
      halfDayStart,
      halfDayEnd,
      substituteId,
      requiresApproval,
      currentApproverId: substituteId ? null : employee.managerId,
    };
  }

  /** Compare-and-swap protects transitions too, including Draft → pending → Draft ABA races. */
  private async updateVersion(
    tx: Prisma.TransactionClient,
    request: Request,
    data: Prisma.RequestUncheckedUpdateInput,
  ): Promise<RequestWithEmployee> {
    const changed = await tx.request.updateMany({
      where: {
        id: request.id,
        workflowState: request.workflowState,
        updatedAt: request.updatedAt,
      },
      data: {
        ...data,
        updatedAt: new Date(
          Math.max(Date.now(), request.updatedAt.getTime() + 1),
        ),
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('Request changed; reload before continuing');
    return tx.request.findUniqueOrThrow({
      where: { id: request.id },
      include: employeeInclude,
    });
  }

  // ----- Generic approve / reject (legacy path for non-Vacation) -----

  async approve(
    id: string,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.type === 'TimeAdjustment') {
      await this.assertApprover(request, actorId);
      return this.approveTimeAdjustment(
        request,
        requiresTwoStageApproval(request)
          ? 'manager_approve_with_hr'
          : 'manager_approve',
        actorId,
        note,
      );
    }
    if (request.type === 'Vacation') {
      // Vacation must use the multi-stage workflow.
      await this.assertApprover(request, actorId);
      return this.transitionVacation(request, 'manager_approve', actorId, note);
    }
    await this.assertApprover(request, actorId);
    if (request.workflowState !== 'PendingManager')
      throw new ConflictException('Request is not pending manager approval');
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await this.updateVersion(tx, request, {
        status: 'Approved',
        workflowState: 'Approved',
        approverId: actorId,
        currentApproverId: null,
        decidedAt: new Date(),
        decisionNote: note,
      });
      await tx.requestEvent.create({
        data: { requestId: id, kind: 'ManagerApproved', actorId, note },
      });
      return updated;
    });
    this.notifications.notifyTransitioned(updated, 'ManagerApproved', actorId);
    return toRequestDto(updated);
  }

  async reject(
    id: string,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.type === 'Vacation') {
      await this.assertApprover(request, actorId);
      return this.transitionVacation(request, 'manager_reject', actorId, note);
    }
    await this.assertApprover(request, actorId);
    if (request.workflowState !== 'PendingManager')
      throw new ConflictException('Request is not pending manager approval');
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await this.updateVersion(tx, request, {
        status: 'Rejected',
        workflowState: 'Rejected',
        approverId: actorId,
        currentApproverId: null,
        decidedAt: new Date(),
        decisionNote: note,
      });
      await tx.requestEvent.create({
        data: { requestId: id, kind: 'ManagerRejected', actorId, note },
      });
      return updated;
    });
    this.notifications.notifyTransitioned(updated, 'ManagerRejected', actorId);
    return toRequestDto(updated);
  }

  // ----- Vacation workflow transitions -----

  async managerApprove(
    id: string,
    actorId: string,
    note: string | null,
    requiresHrConfirmation: boolean,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertApprover(request, actorId);
    // Off-hours TimeAdjustments always need HR confirmation, regardless of the
    // flag set by the manager — the spec calls for a "Sondergenehmigung" first,
    // then the actual time correction.
    const forced = requiresTwoStageApproval(request);
    const event: WorkflowEvent =
      requiresHrConfirmation || forced
        ? 'manager_approve_with_hr'
        : 'manager_approve';
    return this.transitionVacation(request, event, actorId, note);
  }

  async managerReject(
    id: string,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertApprover(request, actorId);
    return this.transitionVacation(request, 'manager_reject', actorId, note);
  }

  async hrConfirm(
    id: string,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertHrAdminRole(actorId);
    return this.transitionVacation(request, 'hr_confirm', actorId, note);
  }

  async hrReject(
    id: string,
    actorId: string,
    note: string,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertHrAdminRole(actorId);
    return this.transitionVacation(request, 'hr_reject', actorId, note);
  }

  async substituteAccept(
    id: string,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.substituteId !== actorId) {
      throw new ForbiddenException('Only the chosen substitute can accept');
    }
    return this.transitionVacation(request, 'substitute_accept', actorId, note);
  }

  async substituteDecline(
    id: string,
    actorId: string,
    note: string,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.substituteId !== actorId) {
      throw new ForbiddenException('Only the chosen substitute can decline');
    }
    return this.transitionVacation(
      request,
      'substitute_decline',
      actorId,
      note,
    );
  }

  async returnForRevision(
    id: string,
    actorId: string,
    note: string,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertApprover(request, actorId);
    return this.transitionVacation(request, 'manager_return', actorId, note);
  }

  // ----- Bulk operations -----

  /**
   * Approve a batch of requests. Each ID is dispatched to the right transition
   * based on its current `workflowState`:
   * - `PendingManager` → manager_approve (or manager_approve_with_hr if the
   *    request is `requiresApproval`-flagged or the caller asked for HR review)
   * - `PendingHr`      → hr_confirm
   *
   * Errors per ID are captured so a single broken row does not abort the batch.
   */
  async bulkApprove(
    actorId: string,
    ids: string[],
    note: string | null,
    requiresHrConfirmation: boolean,
  ): Promise<BulkResult[]> {
    const out: BulkResult[] = [];
    for (const id of ids) {
      try {
        const request = await this.assertRequest(id);
        if (request.workflowState === 'PendingManager') {
          await this.assertApprover(request, actorId);
          const forced = requiresTwoStageApproval(request);
          const event: WorkflowEvent =
            requiresHrConfirmation || forced
              ? 'manager_approve_with_hr'
              : 'manager_approve';
          const updated = await this.transitionVacation(
            request,
            event,
            actorId,
            note,
          );
          out.push({
            id,
            ok: true,
            workflowState: updated.workflowState,
            status: updated.status,
          });
        } else if (request.workflowState === 'PendingHr') {
          await this.assertHrAdminRole(actorId);
          const updated = await this.transitionVacation(
            request,
            'hr_confirm',
            actorId,
            note,
          );
          out.push({
            id,
            ok: true,
            workflowState: updated.workflowState,
            status: updated.status,
          });
        } else {
          out.push({
            id,
            ok: false,
            error: `Request is in state "${request.workflowState}" — not approvable in bulk`,
          });
        }
      } catch (err) {
        out.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }
    return out;
  }

  /**
   * Reject a batch of requests. Note is required (passed to every ID).
   * - `PendingManager` → manager_reject
   * - `PendingHr`      → hr_reject
   */
  async bulkReject(
    actorId: string,
    ids: string[],
    note: string,
  ): Promise<BulkResult[]> {
    const out: BulkResult[] = [];
    for (const id of ids) {
      try {
        const request = await this.assertRequest(id);
        if (request.workflowState === 'PendingManager') {
          await this.assertApprover(request, actorId);
          const updated = await this.transitionVacation(
            request,
            'manager_reject',
            actorId,
            note,
          );
          out.push({
            id,
            ok: true,
            workflowState: updated.workflowState,
            status: updated.status,
          });
        } else if (request.workflowState === 'PendingHr') {
          await this.assertHrAdminRole(actorId);
          const updated = await this.transitionVacation(
            request,
            'hr_reject',
            actorId,
            note,
          );
          out.push({
            id,
            ok: true,
            workflowState: updated.workflowState,
            status: updated.status,
          });
        } else {
          out.push({
            id,
            ok: false,
            error: `Request is in state "${request.workflowState}" — not rejectable in bulk`,
          });
        }
      } catch (err) {
        out.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }
    return out;
  }

  async cancel(
    id: string,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.employeeId !== actorId) {
      // HR/Manager may also cancel — check role.
      const actor = await this.employees.getById(actorId);
      if (actor.role === 'Manager' && request.currentApproverId !== actorId) {
        throw new ForbiddenException(
          'Managers may only cancel assigned requests',
        );
      }
      if (actor.role !== 'Manager' && actor.role !== 'HRAdmin') {
        throw new ForbiddenException(
          'Only the requester or a Manager/HRAdmin may cancel',
        );
      }
    }
    if (request.targetTimeEntryId && request.workflowState === 'Approved')
      throw new ConflictException(
        'An applied correction cannot be undone by cancelling its request; submit a new correction',
      );
    return this.transitionVacation(request, 'cancel', actorId, note);
  }

  // ----- Internal -----

  private async transitionVacation(
    request: Request,
    event: WorkflowEvent,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    if (
      request.type === 'TimeAdjustment' &&
      (event === 'manager_approve' ||
        event === 'manager_approve_with_hr' ||
        event === 'hr_confirm')
    )
      return this.approveTimeAdjustment(request, event, actorId, note);
    const target = nextState(request.workflowState, event, {
      hasSubstitute: !!request.substituteId,
    });
    const status = deriveStatus(target);

    const data: Prisma.RequestUncheckedUpdateInput = {
      workflowState: target,
      status,
    };

    const eventKind = mapEventToKind(event);
    const employeeId = request.employeeId;

    // Side effects per transition.
    if (event === 'submit') {
      // Creation and resubmission have their own validated paths.
    }
    if (event === 'substitute_accept') {
      data.substituteAcceptedAt = new Date();
      // Move approver to manager.
      const employee = await this.employees.getById(employeeId);
      data.currentApproverId = employee.managerId;
    }
    if (event === 'substitute_decline') {
      data.decisionNote = note;
      data.currentApproverId = null;
    }
    if (event === 'manager_approve' || event === 'manager_approve_with_hr') {
      data.approverId = actorId;
      data.decidedAt = event === 'manager_approve' ? new Date() : null;
      data.decisionNote = event === 'manager_approve' ? note : null;
      if (event === 'manager_approve_with_hr') {
        data.currentApproverId = null;
      } else {
        data.currentApproverId = null;
      }
    }
    if (event === 'manager_reject' || event === 'manager_return') {
      data.approverId = actorId;
      data.decidedAt = event === 'manager_reject' ? new Date() : null;
      data.decisionNote = note;
      data.currentApproverId = null;
    }
    if (event === 'hr_confirm' || event === 'hr_reject') {
      data.hrConfirmedAt = event === 'hr_confirm' ? new Date() : null;
      data.decidedAt = new Date();
      data.decisionNote = note;
      data.currentApproverId = null;
    }
    if (event === 'cancel') {
      data.cancelledAt = new Date();
      data.currentApproverId = null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await this.updateVersion(tx, request, data);
      await tx.requestEvent.create({
        data: { requestId: request.id, kind: eventKind, actorId, note },
      });
      return u;
    });
    this.notifications.notifyTransitioned(updated, eventKind, actorId);
    return toRequestDto(updated);
  }

  async timeAdjustmentTargets(
    actorId: string,
    from?: Date,
    to?: Date,
  ): Promise<TimeEntryDto[]> {
    return this.adjustments.targets(actorId, from, to);
  }

  async timeEntryAudit(
    id: string,
    actorId: string,
  ): Promise<TimeEntryAuditDto[]> {
    const request = await this.assertRequest(id);
    await this.assertCanView(request, actorId);
    const rows = await this.prisma.timeEntryAudit.findMany({
      where: { requestId: id },
      include: { actor: { select: { firstName: true, lastName: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ actor, ...row }) => ({
      ...row,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : null,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  private async approveTimeAdjustment(
    expected: Request,
    event: WorkflowEvent,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, expected.employeeId);
      await this.adjustments.assertTeam(tx);
      const request = await tx.request.findUniqueOrThrow({
        where: { id: expected.id },
      });
      if (
        request.updatedAt.getTime() !== expected.updatedAt.getTime() ||
        request.workflowState !== expected.workflowState
      )
        throw new ConflictException(
          'Request changed; reload before continuing',
        );
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: request.employeeId },
      });
      const ids = [
        ...new Set(
          [actorId, employee.managerId].filter((id): id is string => !!id),
        ),
      ].sort();
      if (ids.length)
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "id" FOR SHARE`,
        );
      const actor = await tx.employee.findUniqueOrThrow({
        where: { id: actorId },
      });
      if (!actor.isActive || !employee.isActive)
        throw new ForbiddenException('Active employee and reviewer required');
      const hr = event === 'hr_confirm';
      if (request.workflowState !== (hr ? 'PendingHr' : 'PendingManager'))
        throw new ConflictException(
          'Request is not awaiting this approval stage',
        );
      if (hr) {
        if (actor.role !== 'HRAdmin')
          throw new ForbiddenException('HR confirmation required');
      } else if (actor.role !== 'Manager' && actor.role !== 'HRAdmin') {
        throw new ForbiddenException('Manager approval required');
      }
      if (request.targetTimeEntryId) {
        if (actorId === request.employeeId)
          throw new ForbiddenException(
            'Self approval of a correction is forbidden',
          );
        if (
          !hr &&
          (actor.role !== 'Manager' ||
            actorId !== employee.managerId ||
            request.currentApproverId !== employee.managerId)
        )
          throw new ForbiddenException(
            'Only the current assigned manager may approve this correction',
          );
        if (hr && request.approverId !== employee.managerId)
          throw new ConflictException(
            'Assigned manager changed; cancel and create a new correction request',
          );
      } else if (
        !hr &&
        actor.role === 'Manager' &&
        request.currentApproverId !== actorId
      ) {
        throw new ForbiddenException(
          'Managers may only approve assigned requests',
        );
      }
      const values = await this.adjustments.validate(
        tx,
        request.employeeId,
        request.from,
        request.to,
        request,
        request,
      );
      await this.assertNoActiveOverlap(
        request.employeeId,
        request.from,
        request.to,
        tx,
        request.id,
        true,
      );
      const needsHr =
        !hr &&
        (values.requiresApproval ||
          request.requiresApproval ||
          event === 'manager_approve_with_hr');
      const target = needsHr ? 'PendingHr' : 'Approved';
      const u = await this.updateVersion(tx, request, {
        status: needsHr ? 'Submitted' : 'Approved',
        workflowState: target,
        requiresApproval: values.requiresApproval || request.requiresApproval,
        ...(hr ? { hrConfirmedAt: new Date() } : { approverId: actorId }),
        decidedAt: needsHr ? null : new Date(),
        decisionNote: needsHr ? null : note,
        currentApproverId: null,
      });
      const kind = hr ? 'HrConfirmed' : 'ManagerApproved';
      await tx.requestEvent.create({
        data: { requestId: request.id, kind, actorId, note },
      });
      const entry =
        target === 'Approved'
          ? await this.adjustments.apply(
              tx,
              request,
              actorId,
              values.requiresApproval,
            )
          : null;
      return { request: u, entry, kind };
    });
    this.notifications.notifyTransitioned(result.request, result.kind, actorId);
    if (result.entry)
      this.eventsGateway.broadcast(
        expected.targetTimeEntryId
          ? 'time-entry:updated'
          : 'time-entry:created',
        {
          id: result.entry.id,
          employeeId: result.entry.employeeId,
          clockOut: result.entry.clockOut?.toISOString() ?? null,
        },
      );
    return toRequestDto(result.request);
  }

  private async assertRequest(id: string): Promise<RequestWithEmployee> {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: employeeInclude,
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    return request;
  }

  private async assertApprover(
    request: Request,
    actorId: string,
  ): Promise<void> {
    const actor = await this.employees.getById(actorId);
    if (actor.role !== 'Manager' && actor.role !== 'HRAdmin') {
      throw new ForbiddenException(
        'Only Manager or HRAdmin may approve/reject',
      );
    }
    if (actor.role === 'Manager' && request.currentApproverId !== actorId) {
      throw new ForbiddenException(
        'Managers may only transition assigned requests',
      );
    }
  }

  private async visibilityWhere(
    actorId: string,
  ): Promise<Prisma.RequestWhereInput> {
    const actor = await this.employees.getById(actorId);
    if (actor.role === 'HRAdmin') return {};
    return {
      OR: [
        { employeeId: actorId },
        { approverId: actorId },
        { currentApproverId: actorId },
        { substituteId: actorId },
      ],
    };
  }

  private async assertCanView(
    request: Request,
    actorId: string,
  ): Promise<void> {
    const actor = await this.employees.getById(actorId);
    if (
      actor.role !== 'HRAdmin' &&
      request.employeeId !== actorId &&
      request.approverId !== actorId &&
      request.currentApproverId !== actorId &&
      request.substituteId !== actorId
    ) {
      throw new ForbiddenException('Not permitted to view this request');
    }
  }

  private async assertHrAdminRole(actorId: string): Promise<void> {
    const actor = await this.employees.getById(actorId);
    if (actor.role !== 'HRAdmin') {
      throw new ForbiddenException('Only HRAdmin may HR-confirm/-reject');
    }
  }

  private async assertNoActiveOverlap(
    employeeId: string,
    from: Date,
    to: Date,
    db: Prisma.TransactionClient = this.prisma,
    excludeRequestId?: string,
    timeAdjustment = false,
  ): Promise<void> {
    const overlap = await db.request.findFirst({
      where: {
        employeeId,
        status: { notIn: ['Rejected', 'Cancelled'] },
        ...(timeAdjustment
          ? { NOT: { type: 'TimeAdjustment', status: 'Approved' } }
          : {}),
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        from: { lte: to },
        to: { gte: from },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException(
        'Request overlaps an active request for this employee',
      );
    }
  }
}

function requiresTwoStageApproval(request: Request): boolean {
  // Off-hours TimeAdjustment must be approved twice: manager confirms the
  // Sondergenehmigung for working outside 07:00–23:00, HR finalises the
  // actual time correction.
  return request.type === 'TimeAdjustment' && request.requiresApproval;
}

function mapEventToKind(event: WorkflowEvent): RequestEventKind {
  switch (event) {
    case 'submit':
      return 'Submitted';
    case 'substitute_accept':
      return 'SubstituteAccepted';
    case 'substitute_decline':
      return 'SubstituteDeclined';
    case 'manager_approve':
    case 'manager_approve_with_hr':
      return 'ManagerApproved';
    case 'manager_reject':
      return 'ManagerRejected';
    case 'manager_return':
      return 'Returned';
    case 'hr_confirm':
      return 'HrConfirmed';
    case 'hr_reject':
      return 'HrRejected';
    case 'cancel':
      return 'Cancelled';
  }
}

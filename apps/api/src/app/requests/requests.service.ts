import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Request, RequestEventKind, RequestType, WorkflowState } from '@prisma/client';
import {
  calculateWorkingDays,
  deriveStatus,
  nextState,
  requiresSpecialApproval,
  type WorkflowEvent,
} from 'shared';
import { VacationBalanceService } from '../accounts/vacation-balance.service';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestNotificationService } from '../notifications/request-notification.service';
import {
  toRequestDto,
  type CreateRequestDto,
  type CreateVacationDto,
  type RequestDto,
  type RequestEventDto,
} from './requests.dto';

export interface ListRequestsFilter {
  employeeId?: string;
  status?: string;
  workflowState?: string;
  approverId?: string;
  currentApproverId?: string;
  substituteId?: string;
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly notifications: RequestNotificationService,
    private readonly vacationBalance: VacationBalanceService,
  ) {}

  async list(filter: ListRequestsFilter): Promise<RequestDto[]> {
    const where: Prisma.RequestWhereInput = {};
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.status) where.status = filter.status as Prisma.RequestWhereInput['status'];
    if (filter.workflowState) where.workflowState = filter.workflowState as Prisma.RequestWhereInput['workflowState'];
    if (filter.approverId) where.approverId = filter.approverId;
    if (filter.currentApproverId) where.currentApproverId = filter.currentApproverId;
    if (filter.substituteId) where.substituteId = filter.substituteId;
    const rows = await this.prisma.request.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toRequestDto);
  }

  async getById(id: string): Promise<RequestDto> {
    return toRequestDto(await this.assertRequest(id));
  }

  async events(id: string): Promise<RequestEventDto[]> {
    await this.assertRequest(id);
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

  // ----- Generic create (HomeOffice, SpecialLeave, TimeAdjustment, Vacation-as-fallback) -----

  async create(dto: CreateRequestDto): Promise<RequestDto> {
    if (dto.type === 'Vacation') {
      // Vacation has its own validated path with leave balance check.
      return this.createVacation({
        employeeId: dto.employeeId,
        from: dto.from,
        to: dto.to,
        substituteId: null,
        reason: dto.reason ?? null,
      });
    }
    const employee = await this.employees.getById(dto.employeeId);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('"to" must be on/after "from"');
    }
    const requires =
      dto.type === 'TimeAdjustment' ? requiresSpecialApproval(from, to) : false;
    const calculatedDays = calculateWorkingDays(from, to);
    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          employeeId: employee.id,
          type: dto.type as RequestType,
          status: 'Submitted',
          workflowState: 'PendingManager',
          from,
          to,
          reason: dto.reason ?? null,
          requiresApproval: requires,
          calculatedDays,
          currentApproverId: employee.managerId,
        },
      });
      await tx.requestEvent.create({
        data: { requestId: request.id, kind: 'Submitted', actorId: employee.id },
      });
      return request;
    });
    this.notifications.notifyTransitioned(created, 'Submitted', employee.id);
    return toRequestDto(created);
  }

  // ----- Vacation creation with balance check -----

  async createVacation(dto: CreateVacationDto): Promise<RequestDto> {
    const employee = await this.employees.getById(dto.employeeId);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('"to" must be on/after "from"');
    }
    if (from.getUTCFullYear() !== to.getUTCFullYear()) {
      throw new BadRequestException('Vacation must lie within a single calendar year — split into two requests');
    }
    if (dto.substituteId && dto.substituteId === employee.id) {
      throw new BadRequestException('Substitute must be a different employee');
    }
    const calculatedDays = calculateWorkingDays(from, to);
    if (calculatedDays === 0) {
      throw new BadRequestException('Vacation range covers no working days');
    }

    const balance = await this.vacationBalance.compute(employee.id, from.getUTCFullYear());
    if (balance.remainingDays < calculatedDays) {
      throw new ConflictException(
        `Not enough vacation days remaining (${balance.remainingDays} < ${calculatedDays})`,
      );
    }

    const hasSubstitute = !!dto.substituteId;
    const initialState: WorkflowState = hasSubstitute ? 'PendingSubstitute' : 'PendingManager';

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          employeeId: employee.id,
          type: 'Vacation',
          status: 'Submitted',
          workflowState: initialState,
          from,
          to,
          reason: dto.reason ?? null,
          calculatedDays,
          substituteId: dto.substituteId ?? null,
          currentApproverId: hasSubstitute ? null : employee.managerId,
        },
      });
      await tx.requestEvent.create({
        data: { requestId: request.id, kind: 'Submitted', actorId: employee.id },
      });
      return request;
    });
    this.notifications.notifyTransitioned(created, 'Submitted', employee.id);
    return toRequestDto(created);
  }

  // ----- Generic approve / reject (legacy path for non-Vacation) -----

  async approve(id: string, actorId: string, note: string | null): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.type === 'Vacation') {
      // Vacation must use the multi-stage workflow.
      return this.transitionVacation(request, 'manager_approve', actorId, note);
    }
    if (requiresTwoStageApproval(request)) {
      // Off-hours TimeAdjustment: manager approves the off-hours allowance,
      // then HR finalises the actual time correction.
      await this.assertApproverRole(actorId);
      return this.transitionVacation(request, 'manager_approve_with_hr', actorId, note);
    }
    await this.assertApproverRole(actorId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id: request.id },
        data: {
          status: 'Approved',
          workflowState: 'Approved',
          approverId: actorId,
          currentApproverId: null,
          decidedAt: new Date(),
          decisionNote: note,
        },
      });
      await tx.requestEvent.create({
        data: { requestId: id, kind: 'ManagerApproved', actorId, note },
      });
      return updated;
    });
    this.notifications.notifyTransitioned(updated, 'ManagerApproved', actorId);
    return toRequestDto(updated);
  }

  async reject(id: string, actorId: string, note: string | null): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.type === 'Vacation') {
      return this.transitionVacation(request, 'manager_reject', actorId, note);
    }
    await this.assertApproverRole(actorId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id: request.id },
        data: {
          status: 'Rejected',
          workflowState: 'Rejected',
          approverId: actorId,
          currentApproverId: null,
          decidedAt: new Date(),
          decisionNote: note,
        },
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
    await this.assertApproverRole(actorId);
    // Off-hours TimeAdjustments always need HR confirmation, regardless of the
    // flag set by the manager — the spec calls for a "Sondergenehmigung" first,
    // then the actual time correction.
    const forced = requiresTwoStageApproval(request);
    const event: WorkflowEvent =
      requiresHrConfirmation || forced ? 'manager_approve_with_hr' : 'manager_approve';
    return this.transitionVacation(request, event, actorId, note);
  }

  async managerReject(id: string, actorId: string, note: string | null): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertApproverRole(actorId);
    return this.transitionVacation(request, 'manager_reject', actorId, note);
  }

  async hrConfirm(id: string, actorId: string, note: string | null): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertHrAdminRole(actorId);
    return this.transitionVacation(request, 'hr_confirm', actorId, note);
  }

  async hrReject(id: string, actorId: string, note: string): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertHrAdminRole(actorId);
    return this.transitionVacation(request, 'hr_reject', actorId, note);
  }

  async substituteAccept(id: string, actorId: string, note: string | null): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.substituteId !== actorId) {
      throw new ForbiddenException('Only the chosen substitute can accept');
    }
    return this.transitionVacation(request, 'substitute_accept', actorId, note);
  }

  async substituteDecline(id: string, actorId: string, note: string): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.substituteId !== actorId) {
      throw new ForbiddenException('Only the chosen substitute can decline');
    }
    return this.transitionVacation(request, 'substitute_decline', actorId, note);
  }

  async returnForRevision(id: string, actorId: string, note: string): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    await this.assertApproverRole(actorId);
    return this.transitionVacation(request, 'manager_return', actorId, note);
  }

  async cancel(id: string, actorId: string, note: string | null): Promise<RequestDto> {
    const request = await this.assertRequest(id);
    if (request.employeeId !== actorId) {
      // HR/Manager may also cancel — check role.
      const actor = await this.employees.getById(actorId);
      if (actor.role !== 'Manager' && actor.role !== 'HRAdmin') {
        throw new ForbiddenException('Only the requester or a Manager/HRAdmin may cancel');
      }
    }
    return this.transitionVacation(request, 'cancel', actorId, note);
  }

  // ----- Internal -----

  private async transitionVacation(
    request: Request,
    event: WorkflowEvent,
    actorId: string,
    note: string | null,
  ): Promise<RequestDto> {
    const target = nextState(request.workflowState, event, {
      hasSubstitute: !!request.substituteId,
    });
    const status = deriveStatus(target);

    const data: Prisma.RequestUpdateInput = {
      workflowState: target,
      status,
    };

    const eventKind = mapEventToKind(event);
    const employeeId = request.employeeId;

    // Side effects per transition.
    if (event === 'submit') {
      // No-op here — submit is done at create time.
    }
    if (event === 'substitute_accept') {
      data.substituteAcceptedAt = new Date();
      // Move approver to manager.
      const employee = await this.employees.getById(employeeId);
      data.currentApprover = employee.managerId
        ? { connect: { id: employee.managerId } }
        : { disconnect: true };
    }
    if (event === 'substitute_decline') {
      data.currentApprover = { disconnect: true };
    }
    if (event === 'manager_approve' || event === 'manager_approve_with_hr') {
      data.approverId = actorId;
      data.decidedAt = event === 'manager_approve' ? new Date() : null;
      data.decisionNote = event === 'manager_approve' ? note : null;
      if (event === 'manager_approve_with_hr') {
        data.currentApprover = { disconnect: true };
      } else {
        data.currentApprover = { disconnect: true };
      }
    }
    if (event === 'manager_reject' || event === 'manager_return') {
      data.approverId = actorId;
      data.decidedAt = event === 'manager_reject' ? new Date() : null;
      data.decisionNote = note;
      data.currentApprover = { disconnect: true };
    }
    if (event === 'hr_confirm' || event === 'hr_reject') {
      data.hrConfirmedAt = event === 'hr_confirm' ? new Date() : null;
      data.decidedAt = new Date();
      data.decisionNote = note;
      data.currentApprover = { disconnect: true };
    }
    if (event === 'cancel') {
      data.cancelledAt = new Date();
      data.currentApprover = { disconnect: true };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.request.update({ where: { id: request.id }, data });
      await tx.requestEvent.create({
        data: { requestId: request.id, kind: eventKind, actorId, note },
      });
      return u;
    });
    this.notifications.notifyTransitioned(updated, eventKind, actorId);
    return toRequestDto(updated);
  }

  private async assertRequest(id: string): Promise<Request> {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    return request;
  }

  private async assertApproverRole(actorId: string): Promise<void> {
    const actor = await this.employees.getById(actorId);
    if (actor.role !== 'Manager' && actor.role !== 'HRAdmin') {
      throw new ForbiddenException('Only Manager or HRAdmin may approve/reject');
    }
  }

  private async assertHrAdminRole(actorId: string): Promise<void> {
    const actor = await this.employees.getById(actorId);
    if (actor.role !== 'HRAdmin') {
      throw new ForbiddenException('Only HRAdmin may HR-confirm/-reject');
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
    case 'submit': return 'Submitted';
    case 'substitute_accept': return 'SubstituteAccepted';
    case 'substitute_decline': return 'SubstituteDeclined';
    case 'manager_approve':
    case 'manager_approve_with_hr': return 'ManagerApproved';
    case 'manager_reject': return 'ManagerRejected';
    case 'manager_return': return 'Returned';
    case 'hr_confirm': return 'HrConfirmed';
    case 'hr_reject': return 'HrRejected';
    case 'cancel': return 'Cancelled';
  }
}

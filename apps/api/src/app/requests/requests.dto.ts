import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request } from '@prisma/client';

export class CreateRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsEnum(['Vacation', 'HomeOffice', 'SpecialLeave', 'TimeAdjustment'])
  type!: 'Vacation' | 'HomeOffice' | 'SpecialLeave' | 'TimeAdjustment';

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}

export class CreateVacationDto {
  @IsUUID()
  employeeId!: string;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsUUID()
  substituteId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}

export class TransitionDto {
  @IsUUID()
  actorId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class ManagerApproveDto extends TransitionDto {
  @IsOptional()
  requiresHrConfirmation?: boolean;
}

export class TransitionWithRequiredNoteDto {
  @IsUUID()
  actorId!: string;

  @IsString()
  @MaxLength(2000)
  note!: string;
}

export interface RequestDto {
  id: string;
  employeeId: string;
  type: string;
  status: string;
  workflowState: string;
  from: string;
  to: string;
  reason: string | null;
  requiresApproval: boolean;
  approverId: string | null;
  currentApproverId: string | null;
  substituteId: string | null;
  substituteAcceptedAt: string | null;
  hrConfirmedAt: string | null;
  cancelledAt: string | null;
  calculatedDays: number;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export function toRequestDto(r: Request): RequestDto {
  return {
    id: r.id,
    employeeId: r.employeeId,
    type: r.type,
    status: r.status,
    workflowState: r.workflowState,
    from: r.from.toISOString(),
    to: r.to.toISOString(),
    reason: r.reason,
    requiresApproval: r.requiresApproval,
    approverId: r.approverId,
    currentApproverId: r.currentApproverId,
    substituteId: r.substituteId,
    substituteAcceptedAt: r.substituteAcceptedAt ? r.substituteAcceptedAt.toISOString() : null,
    hrConfirmedAt: r.hrConfirmedAt ? r.hrConfirmedAt.toISOString() : null,
    cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
    calculatedDays: Number(r.calculatedDays),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface RequestEventDto {
  id: string;
  requestId: string;
  at: string;
  actorId: string | null;
  kind: string;
  note: string | null;
}

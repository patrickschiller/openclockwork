import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TimeEntryDto } from './time-entries.dto';

export const ENTRY_APPROVAL_STATES = [
  'Open',
  'BlockedManager',
  'PendingManager',
  'PendingHr',
  'Approved',
  'Rejected',
  'Voided',
] as const;
export type EntryApprovalState = (typeof ENTRY_APPROVAL_STATES)[number];

export class TimeEntryApprovalDto {
  @ApiProperty({ type: TimeEntryDto })
  entry!: TimeEntryDto;
  @ApiProperty({ minimum: 0 })
  revision!: number;
  @ApiProperty()
  employeeName!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  managerId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  managerName!: string | null;
  @ApiProperty({ enum: ENTRY_APPROVAL_STATES })
  state!: EntryApprovalState;
  @ApiProperty()
  canDecide!: boolean;
}

export class DecideTimeEntryApprovalDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  revision!: number;
  @ApiProperty({ enum: ['Manager', 'HR'] })
  @IsIn(['Manager', 'HR'])
  stage!: 'Manager' | 'HR';
  @ApiProperty({ enum: ['Approve', 'Reject'] })
  @IsIn(['Approve', 'Reject'])
  outcome!: 'Approve' | 'Reject';
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class TimeEntryApprovalEventDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  requestId!: string | null;
  @ApiProperty()
  id!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  actorId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  actorName!: string | null;
  @ApiProperty()
  action!: string;
  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;
  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

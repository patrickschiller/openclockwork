import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RequestDto } from '../requests/requests.dto';

export const ATTENDANCE_STATUSES = [
  'Booked',
  'Missing',
  'NoCoreNow',
  'Flexible',
  'Holiday',
  'NonWorkingDay',
  'ApprovedAbsence',
  'PartialAbsenceUnknown',
  'UnknownContract',
  'UnknownSchedule',
  'OutsideEmployment',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export class CockpitEmployeeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() isActive!: boolean;
}
export class CockpitCoreWindowDto {
  @ApiProperty({ format: 'date-time' }) start!: string;
  @ApiProperty({ format: 'date-time' }) end!: string;
  @ApiProperty({ type: String, nullable: true }) label!: string | null;
}
export class CockpitDayAbsenceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['Request', 'Absence'] }) source!: 'Request' | 'Absence';
  @ApiProperty() classification!: string;
  @ApiProperty({ enum: ['Approved', 'Recorded'] }) status!:
    | 'Approved'
    | 'Recorded';
  @ApiProperty({ enum: [0.5, 1] }) coverage!: number;
}
export class CockpitOpenEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) clockIn!: string;
  @ApiProperty() requiresApproval!: boolean;
  @ApiProperty({ type: String, nullable: true }) projectName!: string | null;
  @ApiProperty({ type: String, nullable: true }) serviceOrderTitle!:
    | string
    | null;
}
export class CockpitAttendanceDto extends CockpitEmployeeDto {
  @ApiProperty({ enum: ATTENDANCE_STATUSES }) status!: AttendanceStatus;
  @ApiProperty({
    enum: ['RequiredNow', 'Excused', 'NotRequiredNow', 'Unknown'],
  })
  obligation!: 'RequiredNow' | 'Excused' | 'NotRequiredNow' | 'Unknown';
  @ApiProperty({
    enum: [
      'CoreWindow',
      'OutsideCore',
      'Flexible',
      'Holiday',
      'NonWorkingDay',
      'ApprovedAbsence',
      'PartialDayTimingUnknown',
      'UnknownContract',
      'UnknownSchedule',
      'OutsideEmployment',
    ],
    description:
      'Independent expectation reason, also when an open booking makes status Booked.',
  })
  obligationReason!:
    | 'CoreWindow'
    | 'OutsideCore'
    | 'Flexible'
    | 'Holiday'
    | 'NonWorkingDay'
    | 'ApprovedAbsence'
    | 'PartialDayTimingUnknown'
    | 'UnknownContract'
    | 'UnknownSchedule'
    | 'OutsideEmployment';
  @ApiProperty() contractKnown!: boolean;
  @ApiProperty({ type: String, nullable: true }) scheduleName!: string | null;
  @ApiProperty({ type: CockpitOpenEntryDto, nullable: true })
  openEntry!: CockpitOpenEntryDto | null;
  @ApiProperty({ type: [CockpitCoreWindowDto] })
  coreWindows!: CockpitCoreWindowDto[];
  @ApiProperty({ type: [CockpitDayAbsenceDto] })
  absences!: CockpitDayAbsenceDto[];
}
export class TeamCockpitDto {
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
  @ApiProperty({ format: 'date' }) today!: string;
  @ApiProperty() timeZone!: string;
  @ApiProperty({
    format: 'date-time',
    description:
      'Next known core-time/day boundary. The client must refresh then, on relevant events, and with a fallback timer.',
  })
  nextRefreshAt!: string;
  @ApiProperty({ enum: ['Team', 'Organisation'] }) scope!:
    | 'Team'
    | 'Organisation';
  @ApiProperty({ type: [CockpitAttendanceDto] })
  employees!: CockpitAttendanceDto[];
}
export class CockpitHistoryQueryDto {
  @ApiProperty({
    format: 'date',
    description:
      'Inclusive calendar start in the deployment timezone; at most 1830 days per query.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @ApiPropertyOptional({
    description:
      'Opaque keyset cursor from nextCursor; never an authorization token.',
  })
  @IsOptional()
  @MaxLength(512)
  cursor?: string;
}
export class CockpitProxyEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorId!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ format: 'date-time' }) at!: string;
  @ApiProperty() reason!: string;
}
export class CockpitHistoryItemDto {
  @ApiProperty({ enum: ['TimeEntry', 'Request', 'Absence'] }) kind!:
    | 'TimeEntry'
    | 'Request'
    | 'Absence';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty({
    description:
      'Date-only for allDay records, otherwise an exact ISO instant.',
  })
  from!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Inclusive date for allDay; exclusive clock-out instant for time entries; null means still running.',
  })
  to!: string | null;
  @ApiProperty() allDay!: boolean;
  @ApiProperty() classification!: string;
  @ApiProperty({
    description:
      'Time-entry state (Voided included), recorded absence, or complete request workflow state including Draft/Rejected/Cancelled.',
  })
  status!: string;
  @ApiProperty({ type: String, nullable: true }) workflowState!: string | null;
  @ApiProperty() halfDayStart!: boolean;
  @ApiProperty() halfDayEnd!: boolean;
  @ApiProperty({ type: String, nullable: true }) projectName!: string | null;
  @ApiProperty({ type: String, nullable: true }) serviceOrderTitle!:
    | string
    | null;
  @ApiProperty({ type: Number, nullable: true }) grossMinutes!: number | null;
  @ApiProperty({ type: Number, nullable: true }) breakMinutes!: number | null;
  @ApiProperty({ type: Number, nullable: true }) netMinutes!: number | null;
  @ApiProperty() requiresApproval!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Work/request reason if applicable. Medical absence notes are never included.',
  })
  reason!: string | null;
  @ApiProperty({ type: RequestDto, nullable: true })
  request!: RequestDto | null;
  @ApiProperty({ type: [CockpitProxyEventDto] })
  proxyActions!: CockpitProxyEventDto[];
}
export class CockpitHistoryDto {
  @ApiProperty({ type: CockpitEmployeeDto }) employee!: CockpitEmployeeDto;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty() timeZone!: string;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
  @ApiProperty({ type: [CockpitHistoryItemDto] })
  items!: CockpitHistoryItemDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class CockpitRecordedAbsenceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty({ enum: ['Sickness', 'Training', 'Flextime'] }) kind!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({
    description: 'Proxy recording cannot fabricate a medical certification.',
  })
  certified!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'No medical notes are accepted by the proxy endpoint.',
  })
  note!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

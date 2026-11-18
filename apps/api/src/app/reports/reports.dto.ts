import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

const DATE_ONLY_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export class WorkingTimeReportQueryDto {
  @ApiProperty({ format: 'date', example: '2026-08-01' })
  @Matches(new RegExp(DATE_ONLY_PATTERN))
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-08-31' })
  @Matches(new RegExp(DATE_ONLY_PATTERN))
  to!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Repeat employeeIds for a subset (maximum 200). Omit both employee filters for all employees in the actor’s scope (HR: all; Manager: self and direct reports); cannot be combined with employeeId.',
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeLocations?: string;
}

export class WorkingTimePdfQueryDto extends OmitType(
  WorkingTimeReportQueryDto,
  ['includeLocations'] as const,
) {
  @ApiPropertyOptional({ enum: ['de', 'en'], default: 'de' })
  @IsOptional()
  @IsIn(['de', 'en'])
  locale?: 'de' | 'en';
}

export class WorkingTimeReportEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;
}

export class WorkingTimeReportLocationDto {
  @ApiProperty({ type: String, nullable: true })
  label!: string | null;

  @ApiProperty({ type: Number, nullable: true, minimum: -90, maximum: 90 })
  latitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: -180, maximum: 180 })
  longitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  accuracyMeters!: number | null;
}

export class WorkingTimeReportRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty()
  employeeName!: string;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty({ format: 'date-time' })
  clockIn!: string;

  @ApiProperty({ format: 'date-time' })
  clockOut!: string;

  @ApiProperty({ enum: ['Pending', 'Approved'] })
  status!: string;

  @ApiProperty({ minimum: 0 })
  grossMinutes!: number;

  @ApiProperty({ minimum: 0 })
  breakMinutes!: number;

  @ApiProperty({ minimum: 0 })
  netMinutes!: number;

  @ApiPropertyOptional({ type: WorkingTimeReportLocationDto, nullable: true })
  clockInLocation?: WorkingTimeReportLocationDto | null;

  @ApiPropertyOptional({ type: WorkingTimeReportLocationDto, nullable: true })
  clockOutLocation?: WorkingTimeReportLocationDto | null;
}

export class WorkingTimeReportTotalsDto {
  @ApiProperty({ minimum: 0 })
  grossMinutes!: number;

  @ApiProperty({ minimum: 0 })
  breakMinutes!: number;

  @ApiProperty({ minimum: 0 })
  netMinutes!: number;
}

export class WorkingTimeComparisonDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty()
  employeeName!: string;

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  targetMinutes!: number | null;

  @ApiProperty({ minimum: 0 })
  actualMinutes!: number;

  @ApiProperty({ type: Number, nullable: true })
  differenceMinutes!: number | null;

  @ApiProperty({ enum: ['Known', 'Unknown'] })
  targetStatus!: 'Known' | 'Unknown';

  @ApiProperty({
    type: [String],
    description:
      'Calendar dates lacking a confirmed contract snapshot, including non-working dates.',
  })
  unknownDates!: string[];

  @ApiProperty({ type: String, enum: ['CONTRACT_HISTORY_GAP'], nullable: true })
  reason!: 'CONTRACT_HISTORY_GAP' | null;

  @ApiProperty({
    enum: ['Unknown', 'Negative', 'Balanced', 'Positive', 'Excess'],
    description:
      'Selected-period review indicator only; not a legal limit or a carried overtime balance. Excess means difference >= 600 minutes.',
  })
  indicator!: 'Unknown' | 'Negative' | 'Balanced' | 'Positive' | 'Excess';

  @ApiProperty({
    minimum: 0,
    description:
      'Non-voided, non-rejected open entries started before the period end; excluded from actual minutes.',
  })
  openEntryCount!: number;
}

export class WorkingTimeReportDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ enum: ['net_working_time'] })
  timeDefinition!: 'net_working_time';

  @ApiProperty({
    enum: [600],
    description: 'Period-review threshold, not a statutory working-time limit.',
  })
  excessThresholdMinutes!: 600;

  @ApiProperty({ type: [WorkingTimeComparisonDto] })
  comparisons!: WorkingTimeComparisonDto[];

  @ApiProperty({ type: [WorkingTimeReportRowDto] })
  rows!: WorkingTimeReportRowDto[];

  @ApiProperty({ type: WorkingTimeReportTotalsDto })
  totals!: WorkingTimeReportTotalsDto;
}

export class SoloReportQueryDto {
  @ApiProperty({ format: 'date', example: '2026-09-01' })
  @Matches(new RegExp(DATE_ONLY_PATTERN))
  from!: string;
  @ApiProperty({ format: 'date', example: '2026-09-30' })
  @Matches(new RegExp(DATE_ONLY_PATTERN))
  to!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  serviceOrderId?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  billable?: string;
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'True selects only time without a project.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  unassigned?: string;
}

export class SoloReportTotalsDto extends WorkingTimeReportTotalsDto {
  @ApiProperty({ minimum: 0 })
  billableNetMinutes!: number;
}

export class SoloReportRowDto extends SoloReportTotalsDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'date' })
  date!: string;
  @ApiProperty({ format: 'date-time' })
  clockIn!: string;
  @ApiProperty({ format: 'date-time' })
  clockOut!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  customerId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  customerName!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  projectId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  projectCode!: string | null;
  @ApiProperty({ type: String, nullable: true })
  projectName!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  serviceOrderId!: string | null;
  @ApiProperty({ type: String, nullable: true })
  orderNo!: string | null;
  @ApiProperty({ type: String, nullable: true })
  orderTitle!: string | null;
  @ApiProperty({ type: String, nullable: true })
  activity!: string | null;
  @ApiProperty()
  billable!: boolean;
}

export class SoloReportDto {
  @ApiProperty({ format: 'date' })
  from!: string;
  @ApiProperty({ format: 'date' })
  to!: string;
  @ApiProperty()
  timeZone!: string;
  @ApiProperty({ enum: ['net_working_time'] })
  timeDefinition!: 'net_working_time';
  @ApiProperty({ type: [SoloReportRowDto] })
  rows!: SoloReportRowDto[];
  @ApiProperty({ type: SoloReportTotalsDto })
  totals!: SoloReportTotalsDto;
  @ApiProperty({
    minimum: 0,
    description:
      'Matching open timers, excluded from totals and customer statements.',
  })
  openTimerCount!: number;
}

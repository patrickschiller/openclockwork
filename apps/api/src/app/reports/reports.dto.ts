import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

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

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeLocations?: string;
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

  @ApiProperty({ enum: ['Open', 'Pending', 'Approved'] })
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

export class WorkingTimeReportDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

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

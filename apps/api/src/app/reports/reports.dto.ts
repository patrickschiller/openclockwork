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

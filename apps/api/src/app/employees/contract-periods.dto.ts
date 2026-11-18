import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  ValidateIf,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TimeModel } from '@prisma/client';
import { HOLIDAY_CALENDARS } from 'shared';

export class ConfirmContractPeriodDto {
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string | null;
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  employmentStart!: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  employmentEnd?: string | null;
  @ApiProperty({ minimum: 0, maximum: 168 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(168)
  weeklyHours!: number;
  @ApiProperty({ enum: TimeModel })
  @IsEnum(TimeModel)
  timeModel!: TimeModel;
  @ApiProperty({
    minimum: 0,
    maximum: 127,
    description:
      'Immutable weekday mask: Mon=1, Tue=2, ..., Sun=64. Equal daily target, rounded to whole minutes.',
  })
  @IsInt()
  @Min(0)
  @Max(127)
  workingDays!: number;
  @ApiProperty({ enum: HOLIDAY_CALENDARS })
  @IsEnum(HOLIDAY_CALENDARS)
  holidayCalendar!: string;
  @ApiProperty({
    type: [String],
    description:
      'Explicit non-working dates, supplementing the snapshot calendar.',
  })
  @IsArray()
  @ArrayMaxSize(3660)
  @ArrayUnique()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  holidayDates!: string[];
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  scheduleLabel?: string | null;
  @ApiProperty({
    minLength: 5,
    maxLength: 1000,
    description:
      'HR source/confirmation explanation. No automatic historical inference.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  confirmationNote!: string;
  @ApiProperty({
    enum: [true],
    description:
      'Explicit confirmation that these dated facts are known, not inferred from the current employee profile.',
  })
  @Transform(({ obj }) => obj.confirmed)
  @Equals(true)
  confirmed!: true;
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Explicitly close this prior period on the day before effectiveFrom; no other facts are changed.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  supersedesPeriodId?: string;
  @ApiPropertyOptional({ minimum: 0 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  expectedRevision?: number;
}

export class EmployeeContractPeriodDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty({ format: 'date' }) effectiveFrom!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) effectiveTo!:
    | string
    | null;
  @ApiProperty({ format: 'date' }) employmentStart!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true })
  employmentEnd!: string | null;
  @ApiProperty() weeklyHours!: number;
  @ApiProperty({ enum: TimeModel }) timeModel!: TimeModel;
  @ApiProperty() workingDays!: number;
  @ApiProperty() holidayCalendar!: string;
  @ApiProperty({ type: [String] }) holidayDates!: string[];
  @ApiProperty({ type: String, nullable: true }) scheduleLabel!: string | null;
  @ApiProperty() confirmationNote!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  confirmedById!: string | null;
  @ApiProperty() revision!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

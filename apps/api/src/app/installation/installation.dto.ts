import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SoloBreakRuleDto {
  @ApiProperty() @IsInt() @Min(0) @Max(1440) afterMinutes!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1440) breakMinutes!: number;
}

export class SoloCoreWindowDto {
  @ApiProperty() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start!: string;
  @ApiProperty() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) end!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(127) weekdays!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class UpdateSoloSettingsDto {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiProperty({ example: '2026-09-08' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
  @ApiProperty() @IsBoolean() targetEnabled!: boolean;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  weeklyTargetMinutes?: number | null;
  @ApiProperty() @IsInt() @Min(1) @Max(127) workingDays!: number;
  @ApiProperty() @IsBoolean() leaveEnabled!: boolean;
  @ApiProperty() @IsNumber() @Min(0) @Max(366) annualLeaveDays!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(366)
  carryOverDays?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  carryOverExpiresOn?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-366)
  @Max(366)
  leaveAdjustmentDays?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  leaveAdjustmentReason?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(9999)
  leaveAllowanceYear?: number;
  @ApiProperty()
  @Matches(/^(NONE|DE-(BW|BY|BE|BB|HB|HH|HE|MV|NI|NW|RP|SL|SN|ST|SH|TH))$/)
  holidayCalendar!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(3660)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  holidayDates!: string[];
  @ApiProperty({ type: [SoloBreakRuleDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SoloBreakRuleDto)
  breakRules!: SoloBreakRuleDto[];
  @ApiProperty() @IsBoolean() coreTimeHintsEnabled!: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  frameStart?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  frameEnd?: string;
  @ApiPropertyOptional({ type: [SoloCoreWindowDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SoloCoreWindowDto)
  coreTimes?: SoloCoreWindowDto[];
  @ApiProperty() @IsBoolean() dailyBlockEnabled!: boolean;
  @ApiProperty() @IsBoolean() gpsEnabled!: boolean;
}

export class PreviewModeDto {
  @ApiProperty({ enum: ['Team', 'Solo'] }) @IsIn(['Team', 'Solo']) mode!:
    | 'Team'
    | 'Solo';
}
export class ChangeModeDto extends PreviewModeDto {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
}
export class PersonalDayDto {
  @ApiProperty({ enum: ['Free', 'Vacation', 'Sickness', 'Training'] })
  @IsIn(['Free', 'Vacation', 'Sickness', 'Training'])
  kind!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() halfDayStart?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() halfDayEnd?: boolean;
}
export class EditPersonalDayDto extends PersonalDayDto {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
}
export class RevisionDto {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
}

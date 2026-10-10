import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SoloCapabilitiesResponse {
  @ApiProperty() isOwner!: boolean;
  @ApiProperty() solo!: boolean;
  @ApiProperty() targets!: boolean;
  @ApiProperty() leave!: boolean;
  @ApiProperty() coreTimeHints!: boolean;
  @ApiProperty() dailyBlock!: boolean;
  @ApiProperty() gps!: boolean;
}
export class SoloBreakRuleResponse {
  @ApiProperty() afterMinutes!: number;
  @ApiProperty() breakMinutes!: number;
}
export class SoloCoreWindowResponse {
  @ApiProperty() start!: string;
  @ApiProperty() end!: string;
  @ApiProperty() weekdays!: number;
  @ApiPropertyOptional({ nullable: true }) label?: string | null;
}
export class SoloPolicyResponse {
  @ApiProperty({ type: String, nullable: true }) id!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date' })
  effectiveFrom!: string | null;
  @ApiProperty() targetEnabled!: boolean;
  @ApiProperty({ type: Number, nullable: true }) weeklyTargetMinutes!:
    | number
    | null;
  @ApiProperty() workingDays!: number;
  @ApiProperty() leaveEnabled!: boolean;
  @ApiProperty() annualLeaveDays!: number;
  @ApiProperty() carryOverDays!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date' })
  carryOverExpiresOn!: string | null;
  @ApiProperty() leaveAdjustmentDays!: number;
  @ApiProperty({ type: String, nullable: true }) leaveAdjustmentReason!:
    | string
    | null;
  @ApiProperty() leaveAllowanceYear!: number;
  @ApiProperty() holidayCalendar!: string;
  @ApiProperty({ type: [String] }) holidayDates!: string[];
  @ApiProperty({ type: [SoloBreakRuleResponse] })
  breakRules!: SoloBreakRuleResponse[];
  @ApiProperty() coreTimeHintsEnabled!: boolean;
  @ApiProperty() dailyBlockEnabled!: boolean;
  @ApiProperty() gpsEnabled!: boolean;
  @ApiProperty() frameStart!: string;
  @ApiProperty() frameEnd!: string;
  @ApiProperty({ type: [SoloCoreWindowResponse] })
  coreTimes!: SoloCoreWindowResponse[];
}
export class InstallationStateResponse {
  @ApiProperty({ enum: ['Team', 'Solo'] }) mode!: 'Team' | 'Solo';
  @ApiProperty({ type: String, nullable: true }) ownerEmployeeId!:
    | string
    | null;
  @ApiProperty() setupCompleted!: boolean;
  @ApiProperty() revision!: number;
  @ApiProperty() timeZone!: string;
  @ApiProperty({ type: SoloCapabilitiesResponse })
  capabilities!: SoloCapabilitiesResponse;
  @ApiProperty({ type: SoloPolicyResponse }) policy!: SoloPolicyResponse;
  @ApiProperty({ type: [SoloPolicyResponse] })
  futurePolicies!: SoloPolicyResponse[];
}
export class ModePreviewResponse {
  @ApiProperty() allowed!: boolean;
  @ApiProperty({ type: [String] }) blockers!: string[];
}
export class PersonalDayResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['Free', 'Vacation', 'Sickness', 'Training'] })
  kind!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() halfDayStart!: boolean;
  @ApiProperty() halfDayEnd!: boolean;
  @ApiProperty() revision!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  cancelledAt!: string | null;
}
export class PersonalSummaryResponse {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty() timeZone!: string;
  @ApiProperty() targetEnabled!: boolean;
  @ApiProperty() leaveEnabled!: boolean;
  @ApiProperty() actualMinutes!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Actual net minutes on dates with an enabled Solo target.',
  })
  targetActualMinutes!: number | null;
  @ApiProperty({ type: Number, nullable: true }) targetMinutes!: number | null;
  @ApiProperty({ type: Number, nullable: true }) overtimeMinutes!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) vacationDaysTotal!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) vacationDaysUsed!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) vacationDaysRemaining!:
    | number
    | null;
  @ApiProperty() vacationAllowanceYear!: number;
  @ApiProperty({ type: Number, nullable: true }) vacationDaysCarryOver!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) vacationDaysCarryOverUsed!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) vacationDaysCarryOverExpired!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) vacationDaysAdjustment!:
    | number
    | null;
}
export class InstallationAuditResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  before!: unknown;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  after!: unknown;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}

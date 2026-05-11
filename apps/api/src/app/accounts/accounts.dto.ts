export interface AccountDto {
  employeeId: string;
  overtimeMinutes: number;
  vacationDaysTotal: number;
  vacationDaysUsed: number;
  vacationDaysRemaining: number;
  asOf: string;
}

export interface VacationBalanceDto {
  employeeId: string;
  year: number;
  baseDays: number;
  carryOverDays: number;
  adjustmentDays: number;
  totalEntitlement: number;
  approvedDays: number;
  pendingDays: number;
  remainingDays: number;
  carryOverExpiresOn: string | null;
  adjustmentReason: string | null;
}

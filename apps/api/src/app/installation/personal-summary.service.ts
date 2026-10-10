import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type SoloPolicy } from '@prisma/client';
import { holidayProviderForCalendar } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { calculateCaptureSummaries } from '../time-entries/capture-summary';
import {
  dateOnly,
  DEFAULT_SOLO_POLICY,
  InstallationService,
  localDate,
} from './installation.service';

const DAY_MS = 86_400_000;
type CalendarPolicy = Pick<
  SoloPolicy,
  'workingDays' | 'holidayCalendar' | 'holidayDates'
>;
interface DayRange {
  from: Date;
  to: Date;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}
interface ModeState {
  mode: 'Solo' | 'Team';
  ownerEmployeeId?: string | null;
}

function modeState(value: Prisma.JsonValue | null): ModeState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.mode !== 'Solo' && value.mode !== 'Team') return null;
  return {
    mode: value.mode,
    ownerEmployeeId:
      typeof value.ownerEmployeeId === 'string' ? value.ownerEmployeeId : null,
  };
}

/** Date-valued legacy requests, absences and personal days use UTC date keys. */
function calendarDay(value: Date): Date {
  return dateOnly(value.toISOString().slice(0, 10));
}
function coverage(range: DayRange, day: Date): number {
  const from = calendarDay(range.from),
    to = calendarDay(range.to);
  if (day < from || day > to) return 0;
  return (range.halfDayStart && day.getTime() === from.getTime()) ||
    (range.halfDayEnd && day.getTime() === to.getTime())
    ? 0.5
    : 1;
}

@Injectable()
export class PersonalSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly installation: InstallationService,
  ) {}

  async summary(employeeId: string, fromInput?: string, toInput?: string) {
    await this.installation.requireOwner(employeeId);
    const today = localDate();
    const from = fromInput ?? `${today.slice(0, 4)}-01-01`,
      to = toInput ?? today;
    const first = dateOnly(from),
      last = dateOnly(to);
    if (last < first || (last.getTime() - first.getTime()) / DAY_MS + 1 > 366)
      throw new BadRequestException('Select a period of at most 366 days');
    const start = new Date(`${from}T00:00:00`),
      end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const year = last.getUTCFullYear(),
      yearStart = dateOnly(`${year}-01-01`);
    const beginning = new Date(Math.min(first.getTime(), yearStart.getTime()));

    return this.prisma.$transaction(
      async (tx) => {
        await this.installation.requireOwner(employeeId, tx);
        const [
          policies,
          days,
          entries,
          employee,
          vacations,
          absences,
          modeEvents,
        ] = await Promise.all([
          tx.soloPolicy.findMany({
            where: { employeeId },
            orderBy: [
              { effectiveFrom: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
          }),
          tx.personalDay.findMany({
            where: {
              employeeId,
              cancelledAt: null,
              from: { lte: last },
              to: { gte: beginning },
            },
          }),
          // Complete capture groups are required even outside the selected dates.
          tx.timeEntry.findMany({
            where: {
              employeeId,
              voidedAt: null,
              status: { not: 'Rejected' },
              clockOut: { not: null },
            },
          }),
          tx.employee.findUniqueOrThrow({
            where: { id: employeeId },
            include: { workSchedule: true },
          }),
          tx.request.findMany({
            where: {
              employeeId,
              type: 'Vacation',
              workflowState: 'Approved',
              cancelledAt: null,
              from: { lt: new Date(last.getTime() + DAY_MS) },
              to: { gte: beginning },
            },
          }),
          tx.absence.findMany({
            where: { employeeId, from: { lte: last }, to: { gte: beginning } },
          }),
          tx.installationEvent.findMany({
            where: { action: 'ModeChanged' },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          }),
        ]);

        const policyOn = (day: Date) =>
          policies.filter((policy) => policy.effectiveFrom <= day).at(-1);
        const modeOn = (day: Date): boolean => {
          let state = modeEvents.length
            ? modeState(modeEvents[0].before)
            : null;
          const key = day.toISOString().slice(0, 10);
          // Live access changes immediately, while an explicit accounting date
          // preserves a day that already contains recorded work or time off.
          for (const event of modeEvents) {
            const after = event.after;
            const effective =
              after &&
              typeof after === 'object' &&
              !Array.isArray(after) &&
              typeof after.accountingEffectiveFrom === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(after.accountingEffectiveFrom)
                ? after.accountingEffectiveFrom
                : localDate(event.occurredAt);
            if (effective > key) continue;
            state = modeState(event.after) ?? state;
          }
          return (
            !state ||
            (state.mode === 'Solo' &&
              (!state.ownerEmployeeId || state.ownerEmployeeId === employeeId))
          );
        };
        const legacyCalendar: CalendarPolicy = {
          workingDays: employee.workSchedule?.workingDays ?? 31,
          holidayCalendar: employee.holidayCalendar,
          holidayDates: employee.holidayDates,
        };
        const holidayCache = new Map<
          string,
          ReturnType<typeof holidayProviderForCalendar>
        >();
        const workingDay = (day: Date, calendar: CalendarPolicy): boolean => {
          const key = JSON.stringify([
            calendar.holidayCalendar,
            calendar.holidayDates,
          ]);
          let provider = holidayCache.get(key);
          if (!provider) {
            provider = holidayProviderForCalendar(
              calendar.holidayCalendar,
              calendar.holidayDates,
            );
            holidayCache.set(key, provider);
          }
          return (
            (calendar.workingDays & (1 << ((day.getUTCDay() + 6) % 7))) !== 0 &&
            !provider.isHoliday(day)
          );
        };

        // Legacy approved leave has a persisted total but no per-day calendar
        // snapshot. Preserve that total, allocating it across its available
        // working-date/half-day weights before clipping to the requested year.
        const legacyVacation = new Map<string, number>();
        for (const request of vacations) {
          let weights: Array<{ day: Date; weight: number }> = [];
          const calendarWeights: Array<{ day: Date; weight: number }> = [];
          const requestEnd = calendarDay(request.to);
          for (
            let day = calendarDay(request.from);
            day <= requestEnd;
            day = new Date(day.getTime() + DAY_MS)
          ) {
            const calendar = policyOn(day) ?? legacyCalendar;
            calendarWeights.push({ day, weight: coverage(request, day) });
            if (workingDay(day, calendar))
              weights.push({ day, weight: coverage(request, day) });
          }
          let totalWeight = weights.reduce(
            (total, row) => total + row.weight,
            0,
          );
          const recorded = Number(request.calculatedDays);
          // A changed legacy calendar must never erase an already consumed
          // entitlement. If it no longer supports the stored amount, distribute
          // over the original date span rather than inventing a smaller total.
          if (recorded > totalWeight) {
            weights = calendarWeights;
            totalWeight = weights.reduce((total, row) => total + row.weight, 0);
          }
          const scale =
            totalWeight > 0 && recorded > 0 ? recorded / totalWeight : 1;
          for (const row of weights) {
            const key = row.day.toISOString().slice(0, 10);
            // Old overlapping records do not consume the same day twice.
            legacyVacation.set(
              key,
              Math.max(
                legacyVacation.get(key) ?? 0,
                Math.min(1, row.weight * scale),
              ),
            );
          }
        }

        const summaries = calculateCaptureSummaries(entries);
        const actualByDate = new Map<string, number>();
        for (const entry of entries) {
          if (!entry.clockOut) continue;
          const duration = entry.clockOut.getTime() - entry.clockIn.getTime();
          if (duration <= 0) continue;
          const rowEnd = Math.min(end.getTime(), entry.clockOut.getTime());
          let cursor = new Date(
            Math.max(start.getTime(), entry.clockIn.getTime()),
          );
          while (cursor.getTime() < rowEnd) {
            const midnight = new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate() + 1,
            );
            const fragmentEnd = Math.min(rowEnd, midnight.getTime());
            const net =
              ((summaries.get(entry.id)?.netMinutes ?? 0) *
                (fragmentEnd - cursor.getTime())) /
              duration;
            const key = localDate(cursor);
            actualByDate.set(key, (actualByDate.get(key) ?? 0) + net);
            cursor = new Date(fragmentEnd);
          }
        }

        let targetMinutes = 0,
          targetActualMinutes = 0,
          anyTarget = false;
        const vacationByDate = new Map<string, number>();
        for (
          let day = beginning;
          day <= last;
          day = new Date(day.getTime() + DAY_MS)
        ) {
          const key = day.toISOString().slice(0, 10),
            policy = policyOn(day) ?? DEFAULT_SOLO_POLICY;
          const isSolo = modeOn(day),
            isWorkingDay = workingDay(day, policy);
          const personalCoverage = Math.max(
            0,
            ...days.map((entry) => coverage(entry, day)),
          );
          const inheritedVacation = legacyVacation.get(key) ?? 0;
          const inheritedExcused = Math.max(
            0,
            ...absences
              .filter((entry) => entry.kind !== 'Flextime')
              .map((entry) => coverage(entry, day)),
          );
          if (day >= first && policy.targetEnabled && isSolo) {
            anyTarget = true;
            targetActualMinutes += actualByDate.get(key) ?? 0;
            const workdayCount = Array.from({ length: 7 }, (_, index) =>
              Number(Boolean(policy.workingDays & (1 << index))),
            ).reduce((total, value) => total + value, 0);
            const excused = Math.min(
              1,
              Math.max(personalCoverage, inheritedVacation, inheritedExcused),
            );
            if (isWorkingDay && workdayCount)
              targetMinutes +=
                ((policy.weeklyTargetMinutes ?? 0) / workdayCount) *
                (1 - excused);
          }
          if (day >= yearStart) {
            const personalVacation =
              policy.leaveEnabled && isSolo && isWorkingDay
                ? Math.max(
                    0,
                    ...days
                      .filter((entry) => entry.kind === 'Vacation')
                      .map((entry) => coverage(entry, day)),
                  )
                : 0;
            vacationByDate.set(
              key,
              Math.max(inheritedVacation, personalVacation),
            );
          }
        }

        // Nothing from today's policy is projected backwards into an older period.
        const allowancePolicy = policyOn(last);
        const leaveEnabled = Boolean(
          allowancePolicy?.leaveEnabled && modeOn(last),
        );
        const annualBase = Number(allowancePolicy?.annualLeaveDays ?? 0);
        const matchingYear = allowancePolicy?.leaveAllowanceYear === year;
        const adjustment = matchingYear
          ? Number(allowancePolicy?.leaveAdjustmentDays ?? 0)
          : 0;
        const configuredCarry = matchingYear
          ? Number(allowancePolicy?.carryOverDays ?? 0)
          : 0;
        const expiry = matchingYear
          ? (allowancePolicy?.carryOverExpiresOn ?? null)
          : null;
        const vacationDaysUsed = [...vacationByDate.values()].reduce(
          (total, value) => total + value,
          0,
        );
        const usedBeforeExpiry = [...vacationByDate].reduce(
          (total, [key, value]) =>
            total +
            (!expiry || key <= expiry.toISOString().slice(0, 10) ? value : 0),
          0,
        );
        const carryUsed = Math.min(configuredCarry, usedBeforeExpiry);
        const expiredCarry =
          expiry && last > expiry ? configuredCarry - carryUsed : 0;
        const carryEntitlement = configuredCarry - expiredCarry;
        const allowance = annualBase + adjustment + carryEntitlement;
        const actualMinutes = [...actualByDate.values()].reduce(
          (total, value) => total + value,
          0,
        );
        return {
          from,
          to,
          timeZone:
            process.env.TZ ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            'UTC',
          targetEnabled: anyTarget,
          leaveEnabled,
          actualMinutes,
          targetActualMinutes: anyTarget ? targetActualMinutes : null,
          targetMinutes: anyTarget ? targetMinutes : null,
          overtimeMinutes: anyTarget
            ? targetActualMinutes - targetMinutes
            : null,
          vacationAllowanceYear: year,
          vacationDaysTotal: leaveEnabled ? allowance : null,
          vacationDaysUsed: leaveEnabled ? vacationDaysUsed : null,
          vacationDaysRemaining: leaveEnabled
            ? allowance - vacationDaysUsed
            : null,
          vacationDaysCarryOver: leaveEnabled ? carryEntitlement : null,
          vacationDaysCarryOverUsed: leaveEnabled ? carryUsed : null,
          vacationDaysCarryOverExpired: leaveEnabled ? expiredCarry : null,
          vacationDaysAdjustment: leaveEnabled ? adjustment : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

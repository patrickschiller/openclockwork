import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  detectCoreTimeViolationsForDay,
  holidayProviderForCalendar,
  type CoreTimeWindow,
} from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  dateOnly,
  DEFAULT_SOLO_POLICY,
  InstallationService,
  localDate,
} from './installation.service';
import { parsePersonalWindows } from './personal-windows';

export class PersonalHintDto {
  @ApiProperty() date!: string;
  @ApiProperty({
    enum: [
      'BeforeFrame',
      'AfterFrame',
      'LateArrival',
      'EarlyDeparture',
      'MidDayGap',
    ],
  })
  kind!:
    | 'BeforeFrame'
    | 'AfterFrame'
    | 'LateArrival'
    | 'EarlyDeparture'
    | 'MidDayGap';
  @ApiProperty() boundary!: string;
  @ApiProperty() deltaMinutes!: number;
  @ApiPropertyOptional() windowLabel?: string;
}

export class PersonalHintsDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: PersonalHintDto, isArray: true })
  hints!: PersonalHintDto[];
}

function localBoundary(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00`);
}

@Injectable()
export class PersonalHintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly installation: InstallationService,
  ) {}

  async hints(
    employeeId: string,
    fromInput?: string,
    toInput?: string,
  ): Promise<PersonalHintsDto> {
    await this.installation.requireOwner(employeeId);
    const today = localDate();
    const from = fromInput ?? `${today.slice(0, 7)}-01`;
    const to = toInput ?? today;
    const first = dateOnly(from),
      last = dateOnly(to);
    if (last < first || last.getTime() - first.getTime() > 366 * 86_400_000)
      throw new BadRequestException('Select a period of at most one year');
    const start = localBoundary(from, '00:00'),
      end = localBoundary(to, '00:00');
    end.setDate(end.getDate() + 1);
    const [policies, personalDays, absences, leaveRequests, entries] =
      await Promise.all([
        this.prisma.soloPolicy.findMany({
          where: { employeeId, effectiveFrom: { lte: last } },
          orderBy: [
            { effectiveFrom: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        }),
        this.prisma.personalDay.findMany({
          where: {
            employeeId,
            cancelledAt: null,
            from: { lte: last },
            to: { gte: first },
          },
          select: { from: true, to: true },
        }),
        this.prisma.absence.findMany({
          where: { employeeId, from: { lte: last }, to: { gte: first } },
          select: { from: true, to: true },
        }),
        this.prisma.request.findMany({
          where: {
            employeeId,
            type: { in: ['Vacation', 'SpecialLeave'] },
            workflowState: 'Approved',
            from: { lte: last },
            to: { gte: first },
          },
          select: { from: true, to: true },
        }),
        this.prisma.timeEntry.findMany({
          where: {
            employeeId,
            voidedAt: null,
            status: { not: 'Rejected' },
            clockIn: { lt: end },
            clockOut: { not: null, gt: start },
          },
          select: { clockIn: true, clockOut: true },
          orderBy: { clockIn: 'asc' },
        }),
      ]);
    const excusedDays = [...personalDays, ...absences, ...leaveRequests];
    let enabled = false;
    const hints: PersonalHintDto[] = [];
    for (
      const day = new Date(first);
      day <= last;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const date = day.toISOString().slice(0, 10);
      const policy =
        policies.filter((candidate) => candidate.effectiveFrom <= day).at(-1) ??
        DEFAULT_SOLO_POLICY;
      if (!policy.coreTimeHintsEnabled) continue;
      enabled = true;
      // Today can still be completed. Empty days and excused/holiday days do not
      // invent missing attendance. A half day has no precise morning/afternoon
      // location, so it cannot safely imply a missing core-time window either.
      if (
        date >= today ||
        !(policy.workingDays & (1 << ((day.getUTCDay() + 6) % 7))) ||
        holidayProviderForCalendar(
          policy.holidayCalendar,
          policy.holidayDates,
        ).isHoliday(day) ||
        excusedDays.some((period) => period.from <= day && period.to >= day)
      )
        continue;
      const dayStart = localBoundary(date, '00:00');
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const merged: Array<{ clockIn: Date; clockOut: Date }> = [];
      for (const entry of entries) {
        if (!entry.clockOut) continue;
        const a = Math.max(dayStart.getTime(), entry.clockIn.getTime());
        const b = Math.min(dayEnd.getTime(), entry.clockOut.getTime());
        if (b <= a) continue;
        const previous = merged.at(-1);
        if (previous && a <= previous.clockOut.getTime())
          previous.clockOut = new Date(
            Math.max(b, previous.clockOut.getTime()),
          );
        else merged.push({ clockIn: new Date(a), clockOut: new Date(b) });
      }
      if (!merged.length) continue;
      const windows: CoreTimeWindow[] = parsePersonalWindows(
        policy.coreTimes,
      ).map((window) => {
        const [startHour, startMinute] = window.start.split(':').map(Number);
        const [endHour, endMinute] = window.end.split(':').map(Number);
        return {
          startHour,
          startMinute,
          endHour,
          endMinute,
          weekdays: window.weekdays,
          label: window.label,
        };
      });
      for (const hint of detectCoreTimeViolationsForDay(
        merged,
        windows,
        dayStart,
      )) {
        if (hint.deltaMinutes > 0) hints.push({ date, ...hint });
      }
      const frameStart = localBoundary(date, policy.frameStart);
      const frameEnd =
        policy.frameEnd === '23:59'
          ? dayEnd
          : localBoundary(date, policy.frameEnd);
      const beforeMs = merged.reduce(
        (sum, entry) =>
          sum +
          Math.max(
            0,
            Math.min(frameStart.getTime(), entry.clockOut.getTime()) -
              entry.clockIn.getTime(),
          ),
        0,
      );
      const afterMs = merged.reduce(
        (sum, entry) =>
          sum +
          Math.max(
            0,
            entry.clockOut.getTime() -
              Math.max(frameEnd.getTime(), entry.clockIn.getTime()),
          ),
        0,
      );
      const boundary = `${policy.frameStart}–${policy.frameEnd}`;
      if (beforeMs >= 60_000)
        hints.push({
          date,
          kind: 'BeforeFrame',
          boundary,
          deltaMinutes: Math.floor(beforeMs / 60_000),
        });
      if (afterMs >= 60_000)
        hints.push({
          date,
          kind: 'AfterFrame',
          boundary,
          deltaMinutes: Math.floor(afterMs / 60_000),
        });
    }
    hints.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.boundary.localeCompare(b.boundary) ||
        a.kind.localeCompare(b.kind),
    );
    return { enabled, hints };
  }
}

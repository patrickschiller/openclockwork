import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  Terminal,
  TerminalChallenge,
  TimeEntry,
} from '@prisma/client';
import { requiresSpecialApproval } from 'shared';
import type { WorkSchedulesService } from '../work-schedules/work-schedules.service';

export type TerminalPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  positionTimestamp: Date;
  distanceMeters: number;
} | null;
const ENTRY_INCLUDE = {
  project: { select: { code: true, name: true } },
  serviceOrder: { select: { orderNo: true, title: true } },
} as const;

/** Shared QR/PIN write path. Caller owns security locks, validation and audit. */
export async function bookTerminalTime(
  tx: Prisma.TransactionClient,
  employeeId: string,
  challenge: TerminalChallenge & { terminal: Terminal },
  bookingNow: Date,
  schedule: Awaited<ReturnType<WorkSchedulesService['resolveForEmployee']>>,
  position: TerminalPosition,
  expectedAction?: 'clock-in' | 'clock-out',
) {
  const open = await tx.timeEntry.findFirst({
    where: { employeeId, clockOut: null, voidedAt: null },
    orderBy: { clockIn: 'desc' },
  });
  const action = open ? 'clock-out' : 'clock-in';
  if (expectedAction && expectedAction !== action) {
    throw new ConflictException({
      code: 'TERMINAL_ACTION_MISMATCH',
      message: `Current employee state requires ${action}`,
      action,
    });
  }

  let booked: TimeEntry & {
    project: { code: string; name: string } | null;
    serviceOrder: { orderNo: string; title: string } | null;
  };
  if (action === 'clock-in') {
    const today = localTodayAsUtcDate(bookingNow);
    const dailyBlock = await tx.timeEntry.findFirst({
      where: { employeeId, bookingDate: today, voidedAt: null },
      select: { id: true },
    });
    if (dailyBlock) {
      throw new ConflictException('Today already has a daily-block booking');
    }
    booked = await tx.timeEntry.create({
      data: {
        employeeId,
        clockIn: bookingNow,
        source: 'Terminal',
        approvalMode: 'Team',
        breakRules: schedule.breakRules,
        status: 'Open',
        requiresApproval: requiresSpecialApproval(
          bookingNow,
          null,
          schedule.frame,
        ),
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        accuracyMeters: position?.accuracyMeters ?? null,
        terminalDistanceMeters: position?.distanceMeters ?? null,
        terminalRadiusMeters: position ? challenge.terminal.radiusMeters : null,
        terminalMaxAccuracyMeters: position
          ? challenge.terminal.maxAccuracyMeters
          : null,
        positionTimestamp: position?.positionTimestamp ?? null,
        terminalLocationLabel: challenge.terminal.locationLabel,
        terminalId: challenge.terminalId,
        clockInChallengeId: challenge.id,
      },
      include: ENTRY_INCLUDE,
    });
  } else {
    if (!open) throw new ConflictException('No open entry to close');
    if (bookingNow <= open.clockIn) {
      throw new BadRequestException('Clock-out must be after clock-in');
    }
    const requires = requiresSpecialApproval(
      open.clockIn,
      bookingNow,
      schedule.frame,
    );
    const updated = await tx.timeEntry.updateMany({
      where: { id: open.id, clockOut: null },
      data: {
        clockOut: bookingNow,
        revision: { increment: 1 },
        status: requires ? 'Pending' : 'Approved',
        requiresApproval: requires,
        clockOutLatitude: position?.latitude ?? null,
        clockOutLongitude: position?.longitude ?? null,
        clockOutAccuracyMeters: position?.accuracyMeters ?? null,
        clockOutTerminalDistanceMeters: position?.distanceMeters ?? null,
        clockOutTerminalRadiusMeters: position
          ? challenge.terminal.radiusMeters
          : null,
        clockOutTerminalMaxAccuracyMeters: position
          ? challenge.terminal.maxAccuracyMeters
          : null,
        clockOutPositionTimestamp: position?.positionTimestamp ?? null,
        clockOutTerminalLocationLabel: challenge.terminal.locationLabel,
        clockOutTerminalId: challenge.terminalId,
        clockOutChallengeId: challenge.id,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('Time entry was already closed');
    }
    const row = await tx.timeEntry.findUnique({
      where: { id: open.id },
      include: ENTRY_INCLUDE,
    });
    if (!row) throw new NotFoundException('Time entry not found');
    booked = row;
  }
  await tx.terminalChallengeRedemption.create({
    data: {
      challengeId: challenge.id,
      employeeId,
      timeEntryId: booked.id,
      action,
    },
  });
  return { entry: booked, action: action as 'clock-in' | 'clock-out' };
}

function localTodayAsUtcDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

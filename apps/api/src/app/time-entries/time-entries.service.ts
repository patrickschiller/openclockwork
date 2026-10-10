import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TimeEntry } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  calculateBreakMinutes,
  calculateDailyTargetMinutes,
  calculateGrossMinutesForNet,
  countWorkingDays,
  parseBreakRules,
  holidayProviderForCalendar,
  requiresSpecialApproval,
} from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { ProjectsService } from '../projects/projects.service';
import { InstallationService } from '../installation/installation.service';
import { calculateCaptureSummaries } from './capture-summary';
import type { JwtUser } from '../auth/jwt.strategy';
import {
  toTimeEntryDto,
  type BookProjectRangeDto,
  type BookProjectRangeResult,
  type ClockInDto,
  type ClockOutDto,
  type CreateDailyBlockDto,
  type DailyBlockOptionDto,
  type SplitTimeEntryDto,
  type SplitTimeEntryResult,
  type TimeEntryDto,
  type UpdateTimeEntryDto,
  type ManualTimeEntryDto,
  type CorrectTimeEntryDto,
  type VoidTimeEntryDto,
  type SwitchProjectDto,
  type TimeEntryAuditDto,
} from './time-entries.dto';

const PROJECT_SELECT = { select: { code: true, name: true } } as const;
const SERVICE_ORDER_SELECT = {
  select: { orderNo: true, title: true },
} as const;
const ENTRY_INCLUDE = {
  project: PROJECT_SELECT,
  serviceOrder: SERVICE_ORDER_SELECT,
} as const;

/** Booking-target fields carried by every project booking path. */
interface BookingTarget {
  projectId: string | null;
  serviceOrderId: string | null;
  activity: string | null;
  billable: boolean;
}

interface ParsedLocalBookingTime {
  bookingDate: Date;
  clockIn: Date;
  dayStart: Date;
  dayEnd: Date;
}

function dailyBlockError(code: string, message: string) {
  return { code, message };
}

function parseLocalBookingTime(
  dateValue: string,
  startValue: string,
): ParsedLocalBookingTime {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = startValue.split(':').map(Number);
  const clockIn = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    clockIn.getFullYear() !== year ||
    clockIn.getMonth() !== month - 1 ||
    clockIn.getDate() !== day ||
    clockIn.getHours() !== hour ||
    clockIn.getMinutes() !== minute
  ) {
    throw new BadRequestException(
      dailyBlockError(
        'DAILY_BLOCK_INVALID_DATE_TIME',
        'Invalid daily-block date or start time',
      ),
    );
  }
  // A local wall-clock time can occur twice when the UTC offset moves back.
  // Reject this convenience form rather than silently choosing one occurrence.
  const offsets = new Set(
    [-2, -1, 1, 2].map((days) =>
      new Date(clockIn.getTime() + days * 86_400_000).getTimezoneOffset(),
    ),
  );
  for (const offset of offsets) {
    if (offset === clockIn.getTimezoneOffset()) continue;
    const candidate = new Date(
      clockIn.getTime() + (offset - clockIn.getTimezoneOffset()) * 60_000,
    );
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day &&
      candidate.getHours() === hour &&
      candidate.getMinutes() === minute
    ) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_AMBIGUOUS_DATE_TIME',
          'This local time occurs twice; choose an unambiguous daily-block start',
        ),
      );
    }
  }
  return {
    bookingDate: new Date(Date.UTC(year, month - 1, day)),
    clockIn,
    dayStart: new Date(year, month - 1, day),
    dayEnd: new Date(year, month - 1, day + 1),
  };
}

function utcDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function localTodayAsUtcDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function weekdayBit(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 64 : 1 << (day - 1);
}

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly schedules: WorkSchedulesService,
    private readonly projects: ProjectsService,
    private readonly installation: InstallationService,
  ) {}

  async list(
    employeeId: string,
    user: JwtUser,
    from?: Date,
    to?: Date,
  ): Promise<TimeEntryDto[]> {
    await this.assertAccess(employeeId, user);
    const policy = await this.installation.policyFor(user.id);
    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime())) ||
      (from && to && from > to)
    ) {
      throw new BadRequestException('Invalid time range');
    }
    const where: Prisma.TimeEntryWhereInput = { employeeId };
    if (policy.isSolo && (from || to)) {
      if (to) where.clockIn = { lte: to };
      if (from) where.OR = [{ clockOut: null }, { clockOut: { gt: from } }];
    } else if (from || to) {
      where.clockIn = {};
      if (from) (where.clockIn as Prisma.DateTimeFilter).gte = from;
      if (to) (where.clockIn as Prisma.DateTimeFilter).lte = to;
    }
    const rows = await this.prisma.timeEntry.findMany({
      where,
      orderBy: { clockIn: 'desc' },
      take: policy.isSolo ? undefined : 100,
      include: ENTRY_INCLUDE,
    });
    return this.withCaptureSummaries(rows);
  }

  async dailyBlockOption(
    employeeId: string,
    date?: string,
  ): Promise<DailyBlockOptionDto> {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new BadRequestException('date must be YYYY-MM-DD');
    const at = date ? parseLocalBookingTime(date, '12:00').clockIn : new Date();
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { allowDailyBlockBooking: true, weeklyHours: true },
    });
    if (!employee)
      throw new NotFoundException(`Employee ${employeeId} not found`);
    const schedule = await this.schedules.resolveForEmployee(employeeId);
    const policy = await this.installation.policyFor(employeeId, at);
    const workdays = policy.isSolo ? policy.workingDays : schedule.workingDays;
    const rules = policy.isSolo ? policy.breakRules : schedule.breakRules;
    const workdayCount = countWorkingDays(workdays);
    const dailyNetMinutes = calculateDailyTargetMinutes(
      policy.isSolo
        ? policy.targetEnabled
          ? (policy.weeklyTargetMinutes ?? 0) / 60
          : 0
        : Number(employee.weeklyHours),
      workdays,
    );
    const grossMinutes = calculateGrossMinutesForNet(dailyNetMinutes, rules);
    return {
      enabled: policy.isSolo
        ? policy.dailyBlockEnabled && policy.targetEnabled
        : employee.allowDailyBlockBooking,
      dailyNetMinutes,
      grossMinutes,
      breakMinutes: calculateBreakMinutes(grossMinutes, rules),
      workdayCount,
    };
  }

  async createDailyBlock(
    dto: CreateDailyBlockDto,
    user: JwtUser,
  ): Promise<TimeEntryDto> {
    const parsed = parseLocalBookingTime(dto.date, dto.start);
    const policy = await this.installation.policyFor(user.id, parsed.clockIn);
    if (policy.isSolo) await this.installation.requireOwner(user.id);
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.id },
    });
    if (!employee || !employee.isActive) {
      throw new NotFoundException(`Employee ${user.id} not found`);
    }
    if (
      policy.isSolo
        ? !policy.dailyBlockEnabled || !policy.targetEnabled
        : !employee.allowDailyBlockBooking
    ) {
      throw new ForbiddenException(
        dailyBlockError(
          'DAILY_BLOCK_DISABLED',
          'Daily block booking is not enabled for this employee',
        ),
      );
    }

    if (parsed.bookingDate.getTime() > localTodayAsUtcDate().getTime()) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_FUTURE_DATE',
          'Daily blocks cannot be booked in advance',
        ),
      );
    }
    if (dto.date < utcDateOnly(employee.startDate)) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_BEFORE_EMPLOYMENT',
          'Daily block cannot be before the employee start date',
        ),
      );
    }

    const schedule = await this.schedules.resolveForEmployee(employee.id);
    const workdays = policy.isSolo ? policy.workingDays : schedule.workingDays;
    const rules = policy.isSolo ? policy.breakRules : schedule.breakRules;
    const dailyNetMinutes = calculateDailyTargetMinutes(
      policy.isSolo
        ? (policy.weeklyTargetMinutes ?? 0) / 60
        : Number(employee.weeklyHours),
      workdays,
    );
    if (dailyNetMinutes <= 0) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_NO_DAILY_TARGET',
          'Employee has no positive daily work target',
        ),
      );
    }
    if ((workdays & weekdayBit(parsed.bookingDate)) === 0) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_NON_WORKING_DAY',
          'Selected date is not a configured working day',
        ),
      );
    }
    if (
      policy.isSolo
        ? holidayProviderForCalendar(
            policy.holidayCalendar,
            policy.holidayDates,
          ).isHoliday(parsed.bookingDate)
        : schedule.holidayProvider.isHoliday(parsed.bookingDate)
    ) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_PUBLIC_HOLIDAY',
          'Selected date is a public holiday',
        ),
      );
    }

    const grossMinutes = calculateGrossMinutesForNet(dailyNetMinutes, rules);
    const clockOut = new Date(parsed.clockIn.getTime() + grossMinutes * 60_000);
    if (
      !policy.isSolo &&
      requiresSpecialApproval(parsed.clockIn, clockOut, schedule.frame)
    ) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_OUTSIDE_FRAME',
          'Daily block must stay within the configured working-time frame',
        ),
      );
    }

    const target = await this.resolveBookingTarget(
      employee.id,
      dto.projectId ?? null,
      dto.serviceOrderId ?? null,
      dto.activity ?? null,
      dto.billable,
    );

    const [existingEntry, blockingAbsence, blockingRequest] = await Promise.all(
      [
        this.prisma.timeEntry.findFirst({
          where: {
            employeeId: employee.id,
            voidedAt: null,
            status: { not: 'Rejected' },
            clockIn: { lt: parsed.dayEnd },
            OR: [{ clockOut: null }, { clockOut: { gt: parsed.dayStart } }],
          },
          select: { id: true },
        }),
        this.prisma.absence.findFirst({
          where: {
            employeeId: employee.id,
            from: { lte: parsed.bookingDate },
            to: { gte: parsed.bookingDate },
          },
          select: { id: true },
        }),
        this.prisma.request.findFirst({
          where: {
            employeeId: employee.id,
            OR: [
              {
                type: { in: ['Vacation', 'SpecialLeave'] },
                workflowState: 'Approved',
                from: { lte: parsed.bookingDate },
                to: { gte: parsed.bookingDate },
              },
              {
                type: 'TimeAdjustment',
                workflowState: {
                  in: [
                    'Draft',
                    'Submitted',
                    'PendingSubstitute',
                    'PendingManager',
                    'PendingHr',
                  ],
                },
                from: { lt: parsed.dayEnd },
                to: { gt: parsed.dayStart },
              },
            ],
          },
          select: { id: true },
        }),
      ],
    );
    if (existingEntry) {
      throw new ConflictException(
        dailyBlockError(
          'DAILY_BLOCK_TIME_ENTRY_CONFLICT',
          'Selected day already contains a time entry',
        ),
      );
    }
    if (blockingAbsence || blockingRequest) {
      throw new ConflictException(
        dailyBlockError(
          'DAILY_BLOCK_ABSENCE_CONFLICT',
          'Selected day is covered by an absence or active request',
        ),
      );
    }

    let created: TimeEntry & {
      project: { code: string; name: string } | null;
      serviceOrder: { orderNo: string; title: string } | null;
    };
    try {
      created = await this.prisma.$transaction(
        async (tx) => {
          await this.lockEmployee(tx, employee.id);
          await this.assertTransactionAccess(tx, employee.id, policy.isSolo);
          const currentPolicy = await this.installation.policyFor(
            employee.id,
            parsed.clockIn,
          );
          if (
            policy.isSolo &&
            JSON.stringify(currentPolicy) !== JSON.stringify(policy)
          )
            throw new ConflictException(
              'Personal rules changed; reload before booking',
            );
          const activeEmployee = await tx.employee.findUnique({
            where: { id: employee.id },
            select: { isActive: true, allowDailyBlockBooking: true },
          });
          if (
            !activeEmployee?.isActive ||
            (!policy.isSolo && !activeEmployee.allowDailyBlockBooking)
          ) {
            throw new ForbiddenException(
              dailyBlockError(
                'DAILY_BLOCK_DISABLED',
                'Daily block booking is not enabled for this employee',
              ),
            );
          }
          const conflict = await tx.timeEntry.findFirst({
            where: {
              employeeId: employee.id,
              voidedAt: null,
              status: { not: 'Rejected' },
              clockIn: { lt: parsed.dayEnd },
              OR: [{ clockOut: null }, { clockOut: { gt: parsed.dayStart } }],
            },
            select: { id: true },
          });
          if (conflict) {
            throw new ConflictException(
              dailyBlockError(
                'DAILY_BLOCK_TIME_ENTRY_CONFLICT',
                'Selected day already contains a time entry',
              ),
            );
          }
          await this.assertTargetStillBookable(tx, target);
          if (
            policy.isSolo &&
            (await tx.personalDay.findFirst({
              where: {
                employeeId: employee.id,
                cancelledAt: null,
                from: { lte: parsed.bookingDate },
                to: { gte: parsed.bookingDate },
              },
              select: { id: true },
            }))
          ) {
            throw new ConflictException(
              dailyBlockError(
                'DAILY_BLOCK_ABSENCE_CONFLICT',
                'Selected day is covered by a personal calendar entry',
              ),
            );
          }
          const row = await tx.timeEntry.create({
            data: {
              employeeId: employee.id,
              clockIn: parsed.clockIn,
              clockOut,
              bookingDate: parsed.bookingDate,
              source: 'DailyBlock',
              note: dto.note ?? null,
              breakRules: rules,
              captureGroupId: policy.isSolo ? randomUUID() : null,
              approvalMode: policy.isSolo ? 'Solo' : 'Team',
              status: 'Approved',
              requiresApproval: false,
              ...target,
            },
            include: ENTRY_INCLUDE,
          });
          if (policy.isSolo)
            await this.writeAudit(
              tx,
              row,
              user.id,
              'DailyBlockCreated',
              null,
              null,
            );
          return row;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          dailyBlockError(
            'DAILY_BLOCK_ALREADY_EXISTS',
            'A daily block already exists for the selected day',
          ),
        );
      }
      throw error;
    }
    this.events.broadcast('time-entry:created', {
      id: created.id,
      employeeId: created.employeeId,
      clockIn: created.clockIn.toISOString(),
    });
    return toTimeEntryDto(created);
  }

  async clockIn(dto: ClockInDto, employeeId: string): Promise<TimeEntryDto> {
    this.assertLocationTuple(dto.latitude, dto.longitude, dto.accuracyMeters);
    await this.assertActiveEmployee(employeeId);
    let policy = await this.installation.policyFor(employeeId);
    if (policy.isSolo) await this.installation.requireOwner(employeeId);
    const target = await this.resolveBookingTarget(
      employeeId,
      dto.projectId ?? null,
      dto.serviceOrderId ?? null,
      dto.activity ?? null,
      dto.billable,
    );
    const schedule = await this.schedules.resolveForEmployee(employeeId);
    let created: TimeEntry & {
      project: { code: string; name: string } | null;
      serviceOrder: { orderNo: string; title: string } | null;
    };
    try {
      created = await this.prisma.$transaction(
        async (tx) => {
          await this.lockEmployee(tx, employeeId);
          await this.assertTransactionAccess(tx, employeeId, policy.isSolo);
          await this.assertTargetStillBookable(tx, target);
          const activeEmployee = await tx.employee.findUnique({
            where: { id: employeeId },
            select: { isActive: true },
          });
          if (!activeEmployee?.isActive) {
            throw new ForbiddenException('Employee account is not active');
          }
          const bookingNow = new Date();
          policy = await this.installation.policyFor(employeeId, bookingNow);
          const today = localTodayAsUtcDate(bookingNow);
          const [dailyBlock, open] = await Promise.all([
            tx.timeEntry.findFirst({
              where: {
                employeeId,
                bookingDate: today,
                voidedAt: null,
              },
              select: { id: true },
            }),
            tx.timeEntry.findFirst({
              where: { employeeId, clockOut: null, voidedAt: null },
              select: { id: true },
            }),
          ]);
          if (dailyBlock) {
            throw new ConflictException(
              'Today already has a daily-block booking',
            );
          }
          if (open) {
            throw new ConflictException(
              'There is already an open time entry — clock out first',
            );
          }
          if (policy.isSolo)
            await this.assertNoOverlap(tx, employeeId, bookingNow, null);
          const row = await tx.timeEntry.create({
            data: {
              employeeId,
              clockIn: bookingNow,
              source: 'Pwa',
              note: dto.note ?? null,
              breakRules: policy.isSolo
                ? policy.breakRules
                : schedule.breakRules,
              captureGroupId: policy.isSolo ? randomUUID() : null,
              approvalMode: policy.isSolo ? 'Solo' : 'Team',
              status: 'Open',
              requiresApproval:
                !policy.isSolo &&
                requiresSpecialApproval(bookingNow, null, schedule.frame),
              latitude:
                policy.isSolo && !policy.gpsEnabled
                  ? null
                  : (dto.latitude ?? null),
              longitude:
                policy.isSolo && !policy.gpsEnabled
                  ? null
                  : (dto.longitude ?? null),
              accuracyMeters:
                policy.isSolo && !policy.gpsEnabled
                  ? null
                  : (dto.accuracyMeters ?? null),
              ...target,
            },
            include: ENTRY_INCLUDE,
          });
          if (policy.isSolo)
            await this.writeAudit(tx, row, employeeId, 'ClockedIn', null, null);
          return row;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'There is already an open time entry — clock out first',
        );
      }
      throw error;
    }
    this.events.broadcast('time-entry:created', {
      id: created.id,
      employeeId: created.employeeId,
      clockIn: created.clockIn.toISOString(),
    });
    return toTimeEntryDto(created);
  }

  async clockOut(
    employeeId: string,
    dto: ClockOutDto = {},
  ): Promise<TimeEntryDto> {
    this.assertLocationTuple(dto.latitude, dto.longitude, dto.accuracyMeters);
    await this.assertActiveEmployee(employeeId);
    const schedule = await this.schedules.resolveForEmployee(employeeId);
    const policy = await this.installation.policyFor(employeeId);
    if (policy.isSolo) await this.installation.requireOwner(employeeId);
    const updated = await this.prisma.$transaction(
      async (tx) => {
        await this.lockEmployee(tx, employeeId);
        await this.assertTransactionAccess(tx, employeeId, policy.isSolo);
        const activeEmployee = await tx.employee.findUnique({
          where: { id: employeeId },
          select: { isActive: true },
        });
        if (!activeEmployee?.isActive) {
          throw new ForbiddenException('Employee account is not active');
        }
        const bookingNow = new Date();
        const open = await tx.timeEntry.findFirst({
          where: { employeeId, clockOut: null, voidedAt: null },
          orderBy: { clockIn: 'desc' },
        });
        if (!open) throw new NotFoundException('No open time entry to close');
        if (open.approvalMode === 'Solo' && !dto.id)
          throw new BadRequestException('id is required to stop a Solo timer');
        if (dto.id && dto.id !== open.id)
          throw new ConflictException(
            'The running timer changed; reload before stopping',
          );
        this.assertMutable(open, dto.revision);
        if (bookingNow.getTime() <= open.clockIn.getTime()) {
          throw new BadRequestException('Clock-out must be after clock-in');
        }
        const requires =
          open.approvalMode !== 'Solo' &&
          requiresSpecialApproval(open.clockIn, bookingNow, schedule.frame);
        if (policy.isSolo)
          await this.assertNoOverlap(
            tx,
            employeeId,
            open.clockIn,
            bookingNow,
            open.id,
          );
        const before = await this.auditSnapshot(tx, open);
        const result = await tx.timeEntry.updateMany({
          where: { id: open.id, clockOut: null },
          data: {
            clockOut: bookingNow,
            status: requires ? 'Pending' : 'Approved',
            requiresApproval: requires,
            revision: { increment: 1 },
            clockOutLatitude:
              policy.isSolo && !policy.gpsEnabled
                ? null
                : (dto.latitude ?? null),
            clockOutLongitude:
              policy.isSolo && !policy.gpsEnabled
                ? null
                : (dto.longitude ?? null),
            clockOutAccuracyMeters:
              policy.isSolo && !policy.gpsEnabled
                ? null
                : (dto.accuracyMeters ?? null),
          },
        });
        if (result.count !== 1) {
          throw new ConflictException('Time entry was already closed');
        }
        const row = await tx.timeEntry.findUnique({
          where: { id: open.id },
          include: ENTRY_INCLUDE,
        });
        if (!row) throw new NotFoundException('No open time entry to close');
        if (open.approvalMode === 'Solo')
          await this.writeAudit(
            tx,
            row,
            employeeId,
            'ClockedOut',
            before,
            null,
          );
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    this.events.broadcast('time-entry:updated', {
      id: updated.id,
      employeeId: updated.employeeId,
      clockOut: updated.clockOut?.toISOString() ?? null,
    });
    return (await this.withCaptureSummaries([updated]))[0];
  }

  /**
   * Retroactively updates the booking target (project / service order) and
   * the activity of an entry. Sending projectId re-specifies the target
   * completely; activity is editable on its own without project validation
   * (keeps legacy entries editable). Allowed regardless of approval status —
   * attendance totals never change here.
   */
  async update(
    id: string,
    dto: UpdateTimeEntryDto,
    user: JwtUser,
  ): Promise<TimeEntryDto> {
    if (
      dto.projectId === undefined &&
      dto.serviceOrderId === undefined &&
      dto.activity === undefined &&
      dto.billable === undefined &&
      dto.note === undefined
    ) {
      throw new BadRequestException(
        'At least one of projectId, serviceOrderId, activity must be provided',
      );
    }
    const entry = await this.findOrThrow(id);
    await this.assertAccess(entry.employeeId, user);
    this.assertMutable(entry, dto.revision);

    const data: Prisma.TimeEntryUncheckedUpdateInput = {};
    if (dto.projectId !== undefined) {
      const target = await this.resolveBookingTarget(
        entry.employeeId,
        dto.projectId,
        dto.serviceOrderId ?? null,
        undefined,
        dto.billable,
      );
      data.projectId = target.projectId;
      data.serviceOrderId = target.serviceOrderId;
      data.billable = target.billable;
    } else if (dto.serviceOrderId !== undefined) {
      if (dto.serviceOrderId !== null && entry.projectId === null) {
        throw new BadRequestException('serviceOrderId requires a projectId');
      }
      if (entry.projectId !== null) {
        const order = await this.projects.resolveServiceOrder(
          entry.projectId,
          dto.serviceOrderId,
        );
        data.serviceOrderId = order?.id ?? null;
      } else {
        data.serviceOrderId = null;
      }
    }
    if (dto.activity !== undefined) data.activity = dto.activity;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.billable !== undefined) data.billable = dto.billable;
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, entry.employeeId);
      const isSolo = await this.assertTransactionAccess(
        tx,
        entry.employeeId,
        undefined,
        user.id,
      );
      if (isSolo && dto.revision === undefined)
        throw new BadRequestException('revision is required in Solo mode');
      const current = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
      this.assertMutable(current, dto.revision, entry.revision);
      if (dto.projectId !== undefined || dto.serviceOrderId !== undefined) {
        await this.assertTargetStillBookable(tx, {
          projectId:
            dto.projectId === undefined ? current.projectId : dto.projectId,
          serviceOrderId:
            dto.projectId !== undefined
              ? (data.serviceOrderId as string | null)
              : (dto.serviceOrderId ?? null),
          activity: current.activity,
          billable: current.billable,
        });
      }
      const before = await this.auditSnapshot(tx, current);
      const row = await tx.timeEntry.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
        include: ENTRY_INCLUDE,
      });
      if (isSolo || current.approvalMode === 'Solo')
        await this.writeAudit(tx, row, user.id, 'BookingUpdated', before, null);
      return row;
    });
    this.events.broadcast('time-entry:updated', {
      id: updated.id,
      employeeId: updated.employeeId,
      clockOut: updated.clockOut?.toISOString() ?? null,
    });
    return (await this.withCaptureSummaries([updated]))[0];
  }

  /**
   * Splits a closed entry at `dto.at` into two entries so each part can be
   * booked onto a different project. The original keeps its identity (and
   * GPS/note — they belong to the physical clock-in) and ends at the split
   * point; the second segment starts there and ends at the original end.
   */
  async split(
    id: string,
    dto: SplitTimeEntryDto,
    user: JwtUser,
  ): Promise<SplitTimeEntryResult> {
    const entry = await this.findOrThrow(id);
    await this.assertAccess(entry.employeeId, user);
    this.assertMutable(entry, dto.revision);
    if (!entry.clockOut) {
      throw new BadRequestException(
        'Open entries cannot be split — clock out first',
      );
    }
    const at = new Date(dto.at);
    if (
      at.getTime() <= entry.clockIn.getTime() ||
      at.getTime() >= entry.clockOut.getTime()
    ) {
      throw new BadRequestException(
        'Split time must be strictly between clock-in and clock-out',
      );
    }
    // Omitted projectId → the second segment inherits project, service order,
    // and activity unchanged (no re-authorization: the booking was already
    // legitimate). An explicit project is authorized like a fresh booking.
    const second: BookingTarget =
      dto.projectId === undefined
        ? {
            projectId: entry.projectId,
            serviceOrderId: entry.serviceOrderId,
            activity: entry.activity,
            billable: dto.billable ?? entry.billable,
          }
        : await this.resolveBookingTarget(
            entry.employeeId,
            dto.projectId,
            dto.serviceOrderId ?? null,
            dto.activity ?? null,
            dto.billable,
          );

    const schedule = await this.schedules.resolveForEmployee(entry.employeeId);
    const firstRequires =
      entry.approvalMode !== 'Solo' &&
      requiresSpecialApproval(entry.clockIn, at, schedule.frame);
    const secondRequires =
      entry.approvalMode !== 'Solo' &&
      requiresSpecialApproval(at, entry.clockOut, schedule.frame);
    // A rejected entry must not be laundered into approved segments.
    const statusFor = (requires: boolean) =>
      entry.status === 'Rejected'
        ? 'Rejected'
        : requires
          ? 'Pending'
          : 'Approved';

    const [first, secondEntry] = await this.prisma.$transaction(
      async (tx) => {
        await this.lockEmployee(tx, entry.employeeId);
        const isSolo = await this.assertTransactionAccess(
          tx,
          entry.employeeId,
          undefined,
          user.id,
        );
        if (isSolo && dto.revision === undefined)
          throw new BadRequestException('revision is required in Solo mode');
        const current = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
        this.assertMutable(current, dto.revision, entry.revision);
        if (dto.projectId !== undefined)
          await this.assertTargetStillBookable(tx, second);
        const before = await this.auditSnapshot(tx, current);
        const captureGroupId =
          entry.captureGroupId ??
          (isSolo || entry.approvalMode === 'Solo' ? randomUUID() : null);
        const firstSegment = await tx.timeEntry.update({
          where: { id },
          data: {
            clockOut: at,
            captureGroupId,
            revision: { increment: 1 },
            requiresApproval: firstRequires,
            status: statusFor(firstRequires),
            clockOutLatitude: null,
            clockOutLongitude: null,
            clockOutAccuracyMeters: null,
            clockOutTerminalDistanceMeters: null,
            clockOutTerminalRadiusMeters: null,
            clockOutTerminalMaxAccuracyMeters: null,
            clockOutPositionTimestamp: null,
            clockOutTerminalLocationLabel: null,
            clockOutTerminalId: null,
            clockOutChallengeId: null,
          },
          include: ENTRY_INCLUDE,
        });
        const secondSegment = await tx.timeEntry.create({
          data: {
            employeeId: entry.employeeId,
            clockIn: at,
            clockOut: entry.clockOut,
            source: entry.source,
            captureGroupId,
            approvalMode: entry.approvalMode,
            breakRules: parseBreakRules(entry.breakRules),
            status: statusFor(secondRequires),
            requiresApproval: secondRequires,
            clockOutLatitude: entry.clockOutLatitude,
            clockOutLongitude: entry.clockOutLongitude,
            clockOutAccuracyMeters: entry.clockOutAccuracyMeters,
            clockOutTerminalDistanceMeters:
              entry.clockOutTerminalDistanceMeters,
            clockOutTerminalRadiusMeters: entry.clockOutTerminalRadiusMeters,
            clockOutTerminalMaxAccuracyMeters:
              entry.clockOutTerminalMaxAccuracyMeters,
            clockOutPositionTimestamp: entry.clockOutPositionTimestamp,
            clockOutTerminalLocationLabel: entry.clockOutTerminalLocationLabel,
            clockOutTerminalId: entry.clockOutTerminalId,
            clockOutChallengeId: entry.clockOutChallengeId,
            ...second,
          },
          include: ENTRY_INCLUDE,
        });
        await tx.terminalChallengeRedemption.updateMany({
          where: { timeEntryId: entry.id, action: 'clock-out' },
          data: { timeEntryId: secondSegment.id },
        });
        if (isSolo || entry.approvalMode === 'Solo') {
          await this.writeAudit(
            tx,
            firstSegment,
            user.id,
            'Split',
            before,
            null,
          );
          await this.writeAudit(
            tx,
            secondSegment,
            user.id,
            'SplitCreated',
            null,
            null,
          );
        }
        return [firstSegment, secondSegment] as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    this.events.broadcast('time-entry:updated', {
      id: first.id,
      employeeId: first.employeeId,
      clockOut: first.clockOut?.toISOString() ?? null,
    });
    this.events.broadcast('time-entry:created', {
      id: secondEntry.id,
      employeeId: secondEntry.employeeId,
      clockIn: secondEntry.clockIn.toISOString(),
    });
    const mapped = await this.withCaptureSummaries([first, secondEntry]);
    return { first: mapped[0], second: mapped[1] };
  }

  /**
   * Retroactive project booking (Nachtrag): books the range [from, to) onto a
   * project by carving the employee's existing closed entries. The range must
   * be fully covered by closed, non-rejected entries — being clocked in is a
   * hard precondition. Any previous project booking inside the range is
   * overwritten (explicit user action).
   */
  async bookProjectRange(
    dto: BookProjectRangeDto,
    user: JwtUser,
  ): Promise<BookProjectRangeResult> {
    await this.assertAccess(dto.employeeId, user);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('from must be before to');
    }
    const target = await this.resolveBookingTarget(
      dto.employeeId,
      dto.projectId,
      dto.serviceOrderId ?? null,
      dto.activity ?? null,
      dto.billable,
    );
    const schedule = await this.schedules.resolveForEmployee(dto.employeeId);
    const rows = await this.prisma.$transaction(
      async (tx) => {
        await this.lockEmployee(tx, dto.employeeId);
        const isSolo = await this.assertTransactionAccess(
          tx,
          dto.employeeId,
          undefined,
          user.id,
        );
        await this.assertTargetStillBookable(tx, target);
        const overlapping = await tx.timeEntry.findMany({
          where: {
            employeeId: dto.employeeId,
            voidedAt: null,
            status: { not: 'Rejected' },
            clockIn: { lt: to },
            clockOut: { not: null, gt: from },
          },
          orderBy: { clockIn: 'asc' },
        });
        this.assertRangeCovered(from, to, overlapping);
        if (isSolo && !dto.revisions)
          throw new BadRequestException('revisions are required in Solo mode');
        if (dto.revisions) {
          const revisions = new Map(
            dto.revisions.map((entry) => [entry.id, entry.revision]),
          );
          if (
            revisions.size !== overlapping.length ||
            overlapping.some(
              (entry) => revisions.get(entry.id) !== entry.revision,
            )
          )
            throw new ConflictException(
              'Time entries changed; reload before booking the range',
            );
        }
        const changed: Array<
          TimeEntry & {
            project: { code: string; name: string } | null;
            serviceOrder: { orderNo: string; title: string } | null;
          }
        > = [];
        for (const entry of overlapping) {
          const before = await this.auditSnapshot(tx, entry);
          const end = entry.clockOut as Date;
          const points = [
            entry.clockIn,
            ...[from, to].filter(
              (point) => point > entry.clockIn && point < end,
            ),
            end,
          ];
          const captureGroupId =
            entry.captureGroupId ??
            (isSolo || entry.approvalMode === 'Solo' ? randomUUID() : null);
          const originalTarget: BookingTarget = {
            projectId: entry.projectId,
            serviceOrderId: entry.serviceOrderId,
            activity: entry.activity,
            billable: entry.billable,
          };
          const segments: typeof changed = [];
          for (let index = 0; index < points.length - 1; index++) {
            const clockIn = points[index];
            const clockOut = points[index + 1];
            const requiresApproval =
              entry.approvalMode !== 'Solo' &&
              requiresSpecialApproval(clockIn, clockOut, schedule.frame);
            const booking =
              clockIn >= from && clockOut <= to ? target : originalTarget;
            const common = {
              clockOut,
              captureGroupId,
              requiresApproval,
              status: requiresApproval
                ? ('Pending' as const)
                : ('Approved' as const),
              ...booking,
              ...(clockOut.getTime() === end.getTime()
                ? this.clockOutAudit(entry)
                : this.clearClockOutAudit()),
            };
            const row =
              index === 0
                ? await tx.timeEntry.update({
                    where: { id: entry.id },
                    data: { ...common, revision: { increment: 1 } },
                    include: ENTRY_INCLUDE,
                  })
                : await tx.timeEntry.create({
                    data: {
                      ...common,
                      employeeId: entry.employeeId,
                      clockIn,
                      source: entry.source,
                      approvalMode: entry.approvalMode,
                      breakRules: parseBreakRules(entry.breakRules),
                    },
                    include: ENTRY_INCLUDE,
                  });
            segments.push(row);
            changed.push(row);
          }
          const last = segments[segments.length - 1];
          if (last.id !== entry.id)
            await tx.terminalChallengeRedemption.updateMany({
              where: { timeEntryId: entry.id, action: 'clock-out' },
              data: { timeEntryId: last.id },
            });
          if (isSolo || entry.approvalMode === 'Solo') {
            for (const segment of segments)
              await this.writeAudit(
                tx,
                segment,
                user.id,
                segment.id === entry.id ? 'RangeBooked' : 'RangeSegmentCreated',
                segment.id === entry.id ? before : null,
                null,
              );
          }
        }
        return changed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    rows.forEach((row) =>
      this.events.broadcast('time-entry:updated', {
        id: row.id,
        employeeId: row.employeeId,
        clockOut: row.clockOut?.toISOString() ?? null,
      }),
    );
    const entries = (await this.withCaptureSummaries(rows)).sort((a, b) =>
      a.clockIn.localeCompare(b.clockIn),
    );
    return { entries };
  }
  async createManual(
    dto: ManualTimeEntryDto,
    user: JwtUser,
  ): Promise<TimeEntryDto> {
    await this.installation.requireOwner(user.id);
    const clockIn = new Date(dto.clockIn);
    const clockOut = new Date(dto.clockOut);
    this.assertClosedInterval(clockIn, clockOut);
    let policy = await this.installation.policyFor(user.id, clockIn);
    const target = await this.resolveBookingTarget(
      user.id,
      dto.projectId ?? null,
      dto.serviceOrderId ?? null,
      dto.activity ?? null,
      dto.billable,
    );
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, user.id);
      await this.assertTransactionAccess(tx, user.id, true);
      policy = await this.installation.policyFor(user.id, clockIn);
      await this.assertTargetStillBookable(tx, target);
      await this.assertNoOverlap(tx, user.id, clockIn, clockOut);
      const created = await tx.timeEntry.create({
        data: {
          employeeId: user.id,
          clockIn,
          clockOut,
          note: dto.note ?? null,
          source: 'Manual',
          status: 'Approved',
          requiresApproval: false,
          approvalMode: 'Solo',
          captureGroupId: randomUUID(),
          breakRules: policy.breakRules,
          ...target,
        },
        include: ENTRY_INCLUDE,
      });
      await this.writeAudit(tx, created, user.id, 'ManualCreated', null, null);
      return created;
    });
    this.events.broadcast('time-entry:created', {
      id: row.id,
      employeeId: user.id,
      clockIn: row.clockIn.toISOString(),
    });
    return (await this.withCaptureSummaries([row]))[0];
  }

  async correct(
    id: string,
    dto: CorrectTimeEntryDto,
    user: JwtUser,
  ): Promise<TimeEntryDto> {
    await this.installation.requireOwner(user.id);
    const entry = await this.findOrThrow(id);
    if (entry.employeeId !== user.id)
      throw new ForbiddenException('Only your own entries can be corrected');
    this.assertMutable(entry, dto.revision);
    const clockIn = new Date(dto.clockIn);
    const clockOut = new Date(dto.clockOut);
    this.assertClosedInterval(clockIn, clockOut);
    const target =
      dto.projectId !== undefined || dto.serviceOrderId !== undefined
        ? await this.resolveBookingTarget(
            user.id,
            dto.projectId === undefined ? entry.projectId : dto.projectId,
            dto.serviceOrderId ?? null,
            dto.activity === undefined ? entry.activity : dto.activity,
            dto.billable,
          )
        : {
            projectId: entry.projectId,
            serviceOrderId: entry.serviceOrderId,
            activity:
              dto.activity === undefined ? entry.activity : dto.activity,
            billable: dto.billable ?? entry.billable,
          };
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, user.id);
      await this.assertTransactionAccess(tx, user.id, true);
      const current = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
      this.assertMutable(current, dto.revision, entry.revision);
      if (dto.projectId !== undefined || dto.serviceOrderId !== undefined)
        await this.assertTargetStillBookable(tx, target);
      await this.assertNoOverlap(tx, user.id, clockIn, clockOut, id);
      const before = await this.auditSnapshot(tx, current);
      const corrected = await tx.timeEntry.update({
        where: { id },
        data: {
          clockIn,
          clockOut,
          ...target,
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          // A corrected block becomes an ordinary interval; the audit retains its date.
          bookingDate:
            current.source === 'DailyBlock' ? null : current.bookingDate,
          revision: { increment: 1 },
          ...(current.approvalMode === 'Solo'
            ? { status: 'Approved' as const, requiresApproval: false }
            : {}),
        },
        include: ENTRY_INCLUDE,
      });
      await this.writeAudit(
        tx,
        corrected,
        user.id,
        'Corrected',
        before,
        dto.reason.trim(),
      );
      return corrected;
    });
    this.events.broadcast('time-entry:updated', {
      id,
      employeeId: user.id,
      clockOut: row.clockOut?.toISOString() ?? null,
    });
    return (await this.withCaptureSummaries([row]))[0];
  }

  async voidEntry(
    id: string,
    dto: VoidTimeEntryDto,
    user: JwtUser,
  ): Promise<TimeEntryDto> {
    await this.installation.requireOwner(user.id);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, user.id);
      await this.assertTransactionAccess(tx, user.id, true);
      const current = await tx.timeEntry.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Time entry not found');
      if (current.employeeId !== user.id)
        throw new ForbiddenException('Only your own entries can be voided');
      this.assertMutable(current, dto.revision);
      const before = await this.auditSnapshot(tx, current);
      const now = new Date();
      const updated = await tx.timeEntry.update({
        where: { id },
        data: {
          voidedAt: now,
          clockOut:
            current.clockOut ??
            new Date(Math.max(now.getTime(), current.clockIn.getTime() + 1)),
          bookingDate: null,
          revision: { increment: 1 },
        },
        include: ENTRY_INCLUDE,
      });
      await this.writeAudit(
        tx,
        updated,
        user.id,
        'Voided',
        before,
        dto.reason.trim(),
      );
      return updated;
    });
    this.events.broadcast('time-entry:updated', {
      id,
      employeeId: user.id,
      clockOut: row.clockOut?.toISOString() ?? null,
    });
    return (await this.withCaptureSummaries([row]))[0];
  }

  async switchProject(
    id: string,
    dto: SwitchProjectDto,
    user: JwtUser,
  ): Promise<SplitTimeEntryResult> {
    await this.installation.requireOwner(user.id);
    const target = await this.resolveBookingTarget(
      user.id,
      dto.projectId ?? null,
      dto.serviceOrderId ?? null,
      dto.activity ?? null,
      dto.billable,
    );
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, user.id);
      await this.assertTransactionAccess(tx, user.id, true);
      const entry = await tx.timeEntry.findUnique({ where: { id } });
      if (!entry) throw new NotFoundException('Time entry not found');
      if (entry.employeeId !== user.id)
        throw new ForbiddenException('Only your own timer can switch projects');
      this.assertMutable(entry, dto.revision);
      if (entry.clockOut || entry.approvalMode !== 'Solo')
        throw new BadRequestException(
          'Only a running Solo timer can switch projects',
        );
      await this.assertTargetStillBookable(tx, target);
      const at = new Date();
      if (at <= entry.clockIn)
        throw new ConflictException(
          'Timer has not advanced; retry the project switch',
        );
      await this.assertNoOverlap(tx, user.id, entry.clockIn, null, id);
      const before = await this.auditSnapshot(tx, entry);
      const captureGroupId = entry.captureGroupId ?? randomUUID();
      const first = await tx.timeEntry.update({
        where: { id },
        data: {
          clockOut: at,
          status: 'Approved',
          requiresApproval: false,
          revision: { increment: 1 },
          captureGroupId,
        },
        include: ENTRY_INCLUDE,
      });
      const second = await tx.timeEntry.create({
        data: {
          employeeId: user.id,
          clockIn: at,
          note: dto.note ?? null,
          source: 'Pwa',
          status: 'Open',
          requiresApproval: false,
          approvalMode: 'Solo',
          captureGroupId,
          breakRules: parseBreakRules(entry.breakRules),
          ...target,
        },
        include: ENTRY_INCLUDE,
      });
      await this.writeAudit(
        tx,
        first,
        user.id,
        'ProjectSwitched',
        before,
        null,
      );
      await this.writeAudit(
        tx,
        second,
        user.id,
        'ProjectSwitchCreated',
        null,
        null,
      );
      return [first, second];
    });
    this.events.broadcast('time-entry:updated', {
      id,
      employeeId: user.id,
      clockOut: rows[0].clockOut?.toISOString() ?? null,
    });
    this.events.broadcast('time-entry:created', {
      id: rows[1].id,
      employeeId: user.id,
      clockIn: rows[1].clockIn.toISOString(),
    });
    const mapped = await this.withCaptureSummaries(rows);
    return { first: mapped[0], second: mapped[1] };
  }

  async audit(id: string, user: JwtUser): Promise<TimeEntryAuditDto[]> {
    await this.installation.requireOwner(user.id);
    const entry = await this.findOrThrow(id);
    if (entry.employeeId !== user.id)
      throw new ForbiddenException('Only your own audit history is available');
    const rows = await this.prisma.timeEntryAudit.findMany({
      where: { timeEntryId: id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  /**
   * Shared validation for every booking path. `activity === undefined` means
   * "leave activity out of the result" (used by PATCH where activity is
   * handled independently).
   */
  private async resolveBookingTarget(
    employeeId: string,
    projectId: string | null,
    serviceOrderId: string | null,
    activity: string | null | undefined,
    billable?: boolean,
  ): Promise<BookingTarget> {
    if (projectId === null) {
      if (serviceOrderId !== null) {
        throw new BadRequestException('serviceOrderId requires a projectId');
      }
      return {
        projectId: null,
        serviceOrderId: null,
        activity: activity ?? null,
        billable: billable ?? false,
      };
    }
    await this.projects.assertBookable(employeeId, projectId);
    const order = await this.projects.resolveServiceOrder(
      projectId,
      serviceOrderId,
    );
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { defaultBillable: true },
    });
    return {
      projectId,
      serviceOrderId: order?.id ?? null,
      activity: activity ?? null,
      billable: billable ?? order?.defaultBillable ?? project.defaultBillable,
    };
  }

  /** Union-walk over sorted entries; throws 400 with the covered windows. */
  private assertRangeCovered(from: Date, to: Date, sorted: TimeEntry[]): void {
    let cursor = from.getTime();
    let gap = false;
    for (const entry of sorted) {
      const s = entry.clockIn.getTime();
      const e = (entry.clockOut as Date).getTime();
      if (s > cursor) {
        gap = true;
        break;
      }
      cursor = Math.max(cursor, e);
    }
    if (!gap && cursor >= to.getTime()) return;

    // Merge the actually covered windows clipped to [from, to) for the message.
    const windows: Array<[number, number]> = [];
    for (const entry of sorted) {
      const s = Math.max(entry.clockIn.getTime(), from.getTime());
      const e = Math.min((entry.clockOut as Date).getTime(), to.getTime());
      if (s >= e) continue;
      const last = windows[windows.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else windows.push([s, e]);
    }
    const covered =
      windows.length === 0
        ? 'none'
        : windows
            .map(
              ([s, e]) =>
                `${new Date(s).toISOString()}–${new Date(e).toISOString()}`,
            )
            .join(', ');
    throw new BadRequestException(
      `Range is not fully covered by closed bookings. Covered: ${covered}`,
    );
  }

  private async assertAccess(employeeId: string, user: JwtUser): Promise<void> {
    const policy = await this.installation.policyFor(user.id);
    if (policy.isSolo) {
      await this.installation.requireOwner(user.id);
      if (employeeId !== user.id)
        throw new ForbiddenException(
          'Solo access is limited to your own time entries',
        );
    }
    this.assertSelfOrAdmin(employeeId, user);
  }

  private assertMutable(
    entry: TimeEntry,
    revision?: number,
    expectedRevision?: number,
  ): void {
    if (entry.voidedAt)
      throw new ConflictException('A voided time entry cannot be changed');
    if (entry.approvalMode === 'Solo' && revision === undefined)
      throw new BadRequestException(
        'revision is required for Solo time entries',
      );
    if (
      (revision !== undefined && revision !== entry.revision) ||
      (expectedRevision !== undefined && expectedRevision !== entry.revision)
    ) {
      throw new ConflictException('Time entry changed; reload before editing');
    }
  }

  private assertClosedInterval(clockIn: Date, clockOut: Date): void {
    if (
      !Number.isFinite(clockIn.getTime()) ||
      !Number.isFinite(clockOut.getTime()) ||
      clockOut <= clockIn
    )
      throw new BadRequestException('clockOut must be after clockIn');
    if (clockOut.getTime() > Date.now())
      throw new BadRequestException(
        'Working time cannot be booked in the future',
      );
  }

  private async assertTransactionAccess(
    tx: Prisma.TransactionClient,
    employeeId: string,
    expectedSolo?: boolean,
    actorId = employeeId,
  ): Promise<boolean> {
    const installation = await tx.installationSettings.findUnique({
      where: { id: 1 },
    });
    const isSolo = installation?.mode === 'Solo';
    if (expectedSolo !== undefined && isSolo !== expectedSolo)
      throw new ConflictException(
        'Operating mode changed; reload before booking',
      );
    if (isSolo && installation?.ownerEmployeeId !== employeeId)
      throw new ForbiddenException(
        'Solo access requires the installation owner',
      );
    if (isSolo) {
      await this.installation.requireOwner(actorId, tx);
      if (actorId !== employeeId)
        throw new ForbiddenException(
          'Solo writes are limited to your own entries',
        );
    } else if (actorId !== employeeId) {
      const actor = await tx.employee.findUnique({
        where: { id: actorId },
        select: { isActive: true, role: true },
      });
      if (
        !actor?.isActive ||
        (actor.role !== 'Manager' && actor.role !== 'HRAdmin')
      )
        throw new ForbiddenException(
          'Current manager or administrator access is required',
        );
    }
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      select: { isActive: true },
    });
    if (!employee?.isActive)
      throw new ForbiddenException('Employee account is not active');
    return isSolo;
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    employeeId: string,
    from: Date,
    to: Date | null,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await tx.timeEntry.findFirst({
      where: {
        employeeId,
        voidedAt: null,
        status: { not: 'Rejected' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...(to ? { clockIn: { lt: to } } : {}),
        OR: [{ clockOut: null }, { clockOut: { gt: from } }],
      },
      select: { id: true },
    });
    if (conflict)
      throw new ConflictException('Time interval overlaps an existing entry');
  }

  private async assertTargetStillBookable(
    tx: Prisma.TransactionClient,
    target: BookingTarget,
  ): Promise<void> {
    if (!target.projectId) return;
    const initial = await tx.project.findUnique({
      where: { id: target.projectId },
      select: { customerId: true },
    });
    if (!initial) throw new NotFoundException('Project no longer exists');
    if (initial.customerId)
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${initial.customerId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${target.projectId}::uuid FOR UPDATE`;
    if (target.serviceOrderId)
      await tx.$queryRaw`SELECT id FROM "ServiceOrder" WHERE id = ${target.serviceOrderId}::uuid FOR UPDATE`;
    const project = await tx.project.findUnique({
      where: { id: target.projectId },
      include: { customer: true },
    });
    if (!project?.isActive || (project.customer && !project.customer.isActive))
      throw new ConflictException(
        'Project or customer was archived; select an active booking target',
      );
    if (project.customerId !== initial.customerId)
      throw new ConflictException(
        'Project customer changed; reload before booking',
      );
    if (target.serviceOrderId) {
      const order = await tx.serviceOrder.findUnique({
        where: { id: target.serviceOrderId },
      });
      if (!order?.isActive || order.projectId !== target.projectId)
        throw new ConflictException('Service order is no longer bookable');
    } else if (
      await tx.serviceOrder.count({
        where: { projectId: target.projectId, isActive: true },
      })
    ) {
      throw new BadRequestException(
        'Select an active service order for this project',
      );
    }
  }

  private async withCaptureSummaries(
    rows: TimeEntry[],
  ): Promise<TimeEntryDto[]> {
    const groups = rows
      .filter((row) => row.captureGroupId)
      .map((row) => ({
        employeeId: row.employeeId,
        captureGroupId: row.captureGroupId,
      }));
    const siblings = groups.length
      ? await this.prisma.timeEntry.findMany({ where: { OR: groups } })
      : [];
    const summaries = calculateCaptureSummaries([
      ...new Map([...rows, ...siblings].map((row) => [row.id, row])).values(),
    ]);
    return rows.map((row) => ({
      ...toTimeEntryDto(row),
      summary: summaries.get(row.id) ?? null,
    }));
  }

  private async auditSnapshot(
    tx: Prisma.TransactionClient,
    entry: TimeEntry,
  ): Promise<Prisma.InputJsonObject> {
    const group = entry.captureGroupId
      ? await tx.timeEntry.findMany({
          where: {
            employeeId: entry.employeeId,
            captureGroupId: entry.captureGroupId,
          },
        })
      : [entry];
    const summaries = calculateCaptureSummaries(group);
    const summary = summaries.get(entry.id) ?? null;
    const captureSummary = [...summaries.values()].reduce(
      (sum, item) => ({
        grossMinutes: sum.grossMinutes + item.grossMinutes,
        breakMinutes: sum.breakMinutes + item.breakMinutes,
        netMinutes: sum.netMinutes + item.netMinutes,
      }),
      { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 },
    );
    return {
      clockIn: entry.clockIn.toISOString(),
      clockOut: entry.clockOut?.toISOString() ?? null,
      projectId: entry.projectId,
      serviceOrderId: entry.serviceOrderId,
      activity: entry.activity,
      note: entry.note,
      billable: entry.billable,
      revision: entry.revision,
      status: entry.status,
      requiresApproval: entry.requiresApproval,
      approvalMode: entry.approvalMode,
      captureGroupId: entry.captureGroupId,
      breakRules: parseBreakRules(entry.breakRules),
      voidedAt: entry.voidedAt?.toISOString() ?? null,
      bookingDate: entry.bookingDate?.toISOString() ?? null,
      summary: summary ? { ...summary } : null,
      captureSummary: { ...captureSummary },
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    entry: TimeEntry,
    actorId: string,
    action: string,
    before: Prisma.InputJsonObject | null,
    reason: string | null,
  ): Promise<void> {
    await tx.timeEntryAudit.create({
      data: {
        timeEntryId: entry.id,
        actorId,
        action,
        before: before ?? Prisma.DbNull,
        after: await this.auditSnapshot(tx, entry),
        reason,
      },
    });
  }

  private assertSelfOrAdmin(employeeId: string, user: JwtUser): void {
    const isAdmin = user.role === 'Manager' || user.role === 'HRAdmin';
    if (employeeId !== user.id && !isAdmin) {
      throw new ForbiddenException(
        'Only the owner or a Manager/HRAdmin may modify this entry',
      );
    }
  }

  private clearClockOutAudit() {
    return {
      clockOutLatitude: null,
      clockOutLongitude: null,
      clockOutAccuracyMeters: null,
      clockOutTerminalDistanceMeters: null,
      clockOutTerminalRadiusMeters: null,
      clockOutTerminalMaxAccuracyMeters: null,
      clockOutPositionTimestamp: null,
      clockOutTerminalLocationLabel: null,
      clockOutTerminalId: null,
      clockOutChallengeId: null,
    };
  }

  private clockOutAudit(entry: TimeEntry) {
    return {
      clockOutLatitude: entry.clockOutLatitude,
      clockOutLongitude: entry.clockOutLongitude,
      clockOutAccuracyMeters: entry.clockOutAccuracyMeters,
      clockOutTerminalDistanceMeters: entry.clockOutTerminalDistanceMeters,
      clockOutTerminalRadiusMeters: entry.clockOutTerminalRadiusMeters,
      clockOutTerminalMaxAccuracyMeters:
        entry.clockOutTerminalMaxAccuracyMeters,
      clockOutPositionTimestamp: entry.clockOutPositionTimestamp,
      clockOutTerminalLocationLabel: entry.clockOutTerminalLocationLabel,
      clockOutTerminalId: entry.clockOutTerminalId,
      clockOutChallengeId: entry.clockOutChallengeId,
    };
  }

  private async assertActiveEmployee(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { isActive: true },
    });
    if (!employee || !employee.isActive) {
      throw new ForbiddenException('Employee account is not active');
    }
  }

  private assertLocationTuple(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    accuracyMeters: number | null | undefined,
  ): void {
    const values = [latitude, longitude, accuracyMeters];
    const provided = values.filter(
      (value) => value !== null && value !== undefined,
    );
    if (provided.length !== 0 && provided.length !== values.length) {
      throw new BadRequestException(
        'latitude, longitude and accuracyMeters must be provided together',
      );
    }
  }

  private async lockEmployee(
    tx: Prisma.TransactionClient,
    employeeId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (error as { code?: string }).code === 'P2002';
  }

  private async findOrThrow(id: string): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Time entry ${id} not found`);
    return entry;
  }
}

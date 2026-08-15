import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TimeEntry } from '@prisma/client';
import {
  calculateBreakMinutes,
  calculateDailyTargetMinutes,
  calculateGrossMinutesForNet,
  countWorkingDays,
  requiresSpecialApproval,
} from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { ProjectsService } from '../projects/projects.service';
import type { JwtUser } from '../auth/jwt.strategy';
import {
  toTimeEntryDto,
  type BookProjectRangeDto,
  type BookProjectRangeResult,
  type ClockInDto,
  type CreateDailyBlockDto,
  type DailyBlockOptionDto,
  type SplitTimeEntryDto,
  type SplitTimeEntryResult,
  type TimeEntryDto,
  type UpdateTimeEntryDto,
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
  ) {}

  async list(
    employeeId: string,
    from?: Date,
    to?: Date,
  ): Promise<TimeEntryDto[]> {
    const where: Prisma.TimeEntryWhereInput = { employeeId };
    if (from || to) {
      where.clockIn = {};
      if (from) (where.clockIn as Prisma.DateTimeFilter).gte = from;
      if (to) (where.clockIn as Prisma.DateTimeFilter).lte = to;
    }
    const rows = await this.prisma.timeEntry.findMany({
      where,
      orderBy: { clockIn: 'desc' },
      take: 100,
      include: ENTRY_INCLUDE,
    });
    return rows.map(toTimeEntryDto);
  }

  async dailyBlockOption(employeeId: string): Promise<DailyBlockOptionDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { allowDailyBlockBooking: true, weeklyHours: true },
    });
    if (!employee)
      throw new NotFoundException(`Employee ${employeeId} not found`);
    const schedule = await this.schedules.resolveForEmployee(employeeId);
    const workdayCount = countWorkingDays(schedule.workingDays);
    const dailyNetMinutes = calculateDailyTargetMinutes(
      Number(employee.weeklyHours),
      schedule.workingDays,
    );
    const grossMinutes = calculateGrossMinutesForNet(dailyNetMinutes);
    return {
      enabled: employee.allowDailyBlockBooking,
      dailyNetMinutes,
      grossMinutes,
      breakMinutes: calculateBreakMinutes(grossMinutes),
      workdayCount,
    };
  }

  async createDailyBlock(
    dto: CreateDailyBlockDto,
    user: JwtUser,
  ): Promise<TimeEntryDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.id },
    });
    if (!employee || !employee.isActive) {
      throw new NotFoundException(`Employee ${user.id} not found`);
    }
    if (!employee.allowDailyBlockBooking) {
      throw new ForbiddenException(
        dailyBlockError(
          'DAILY_BLOCK_DISABLED',
          'Daily block booking is not enabled for this employee',
        ),
      );
    }

    const parsed = parseLocalBookingTime(dto.date, dto.start);
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
    const dailyNetMinutes = calculateDailyTargetMinutes(
      Number(employee.weeklyHours),
      schedule.workingDays,
    );
    if (dailyNetMinutes <= 0) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_NO_DAILY_TARGET',
          'Employee has no positive daily work target',
        ),
      );
    }
    if ((schedule.workingDays & weekdayBit(parsed.bookingDate)) === 0) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_NON_WORKING_DAY',
          'Selected date is not a configured working day',
        ),
      );
    }
    if (schedule.holidayProvider.isHoliday(parsed.bookingDate)) {
      throw new BadRequestException(
        dailyBlockError(
          'DAILY_BLOCK_PUBLIC_HOLIDAY',
          'Selected date is a public holiday',
        ),
      );
    }

    const grossMinutes = calculateGrossMinutesForNet(dailyNetMinutes);
    const clockOut = new Date(parsed.clockIn.getTime() + grossMinutes * 60_000);
    if (requiresSpecialApproval(parsed.clockIn, clockOut, schedule.frame)) {
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
    );

    const [existingEntry, blockingAbsence, blockingRequest] = await Promise.all(
      [
        this.prisma.timeEntry.findFirst({
          where: {
            employeeId: employee.id,
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
      created = await this.prisma.timeEntry.create({
        data: {
          employeeId: employee.id,
          clockIn: parsed.clockIn,
          clockOut,
          bookingDate: parsed.bookingDate,
          source: 'DailyBlock',
          status: 'Approved',
          requiresApproval: false,
          ...target,
        },
        include: ENTRY_INCLUDE,
      });
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

  async clockIn(dto: ClockInDto): Promise<TimeEntryDto> {
    const today = localTodayAsUtcDate();
    const dailyBlock = await this.prisma.timeEntry.findUnique({
      where: {
        employeeId_bookingDate: {
          employeeId: dto.employeeId,
          bookingDate: today,
        },
      },
      select: { id: true },
    });
    if (dailyBlock) {
      throw new ConflictException('Today already has a daily-block booking');
    }
    const open = await this.prisma.timeEntry.findFirst({
      where: { employeeId: dto.employeeId, clockOut: null },
    });
    if (open) {
      throw new ConflictException(
        'There is already an open time entry — clock out first',
      );
    }
    const target = await this.resolveBookingTarget(
      dto.employeeId,
      dto.projectId ?? null,
      dto.serviceOrderId ?? null,
      dto.activity ?? null,
    );
    const schedule = await this.schedules.resolveForEmployee(dto.employeeId);
    const now = new Date();
    const created = await this.prisma.timeEntry.create({
      data: {
        employeeId: dto.employeeId,
        clockIn: now,
        source: 'Pwa',
        status: 'Open',
        requiresApproval: requiresSpecialApproval(now, null, schedule.frame),
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        accuracyMeters: dto.accuracyMeters ?? null,
        ...target,
      },
      include: ENTRY_INCLUDE,
    });
    this.events.broadcast('time-entry:created', {
      id: created.id,
      employeeId: created.employeeId,
      clockIn: created.clockIn.toISOString(),
    });
    return toTimeEntryDto(created);
  }

  async clockOut(employeeId: string): Promise<TimeEntryDto> {
    const open = await this.prisma.timeEntry.findFirst({
      where: { employeeId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });
    if (!open) throw new NotFoundException('No open time entry to close');
    const now = new Date();
    if (now.getTime() <= open.clockIn.getTime()) {
      throw new BadRequestException('Clock-out must be after clock-in');
    }
    const schedule = await this.schedules.resolveForEmployee(employeeId);
    const requires = requiresSpecialApproval(open.clockIn, now, schedule.frame);
    const updated = await this.prisma.timeEntry.update({
      where: { id: open.id },
      data: {
        clockOut: now,
        status: requires ? 'Pending' : 'Approved',
        requiresApproval: requires,
      },
      include: ENTRY_INCLUDE,
    });
    this.events.broadcast('time-entry:updated', {
      id: updated.id,
      employeeId: updated.employeeId,
      clockOut: updated.clockOut?.toISOString() ?? null,
    });
    return toTimeEntryDto(updated);
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
      dto.activity === undefined
    ) {
      throw new BadRequestException(
        'At least one of projectId, serviceOrderId, activity must be provided',
      );
    }
    const entry = await this.findOrThrow(id);
    this.assertOwnerOrAdmin(entry, user);

    const data: Prisma.TimeEntryUncheckedUpdateInput = {};
    if (dto.projectId !== undefined) {
      const target = await this.resolveBookingTarget(
        entry.employeeId,
        dto.projectId,
        dto.serviceOrderId ?? null,
        undefined,
      );
      data.projectId = target.projectId;
      data.serviceOrderId = target.serviceOrderId;
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

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data,
      include: ENTRY_INCLUDE,
    });
    this.events.broadcast('time-entry:updated', {
      id: updated.id,
      employeeId: updated.employeeId,
      clockOut: updated.clockOut?.toISOString() ?? null,
    });
    return toTimeEntryDto(updated);
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
    this.assertOwnerOrAdmin(entry, user);
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
          }
        : await this.resolveBookingTarget(
            entry.employeeId,
            dto.projectId,
            dto.serviceOrderId ?? null,
            dto.activity ?? null,
          );

    const schedule = await this.schedules.resolveForEmployee(entry.employeeId);
    const firstRequires = requiresSpecialApproval(
      entry.clockIn,
      at,
      schedule.frame,
    );
    const secondRequires = requiresSpecialApproval(
      at,
      entry.clockOut,
      schedule.frame,
    );
    // A rejected entry must not be laundered into approved segments.
    const statusFor = (requires: boolean) =>
      entry.status === 'Rejected'
        ? 'Rejected'
        : requires
          ? 'Pending'
          : 'Approved';

    const [first, secondEntry] = await this.prisma.$transaction([
      this.prisma.timeEntry.update({
        where: { id },
        data: {
          clockOut: at,
          requiresApproval: firstRequires,
          status: statusFor(firstRequires),
        },
        include: ENTRY_INCLUDE,
      }),
      this.prisma.timeEntry.create({
        data: {
          employeeId: entry.employeeId,
          clockIn: at,
          clockOut: entry.clockOut,
          source: entry.source,
          status: statusFor(secondRequires),
          requiresApproval: secondRequires,
          ...second,
        },
        include: ENTRY_INCLUDE,
      }),
    ]);

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
    return {
      first: toTimeEntryDto(first),
      second: toTimeEntryDto(secondEntry),
    };
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
    this.assertSelfOrAdmin(dto.employeeId, user);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('from must be before to');
    }
    const target = await this.resolveBookingTarget(
      dto.employeeId,
      dto.projectId,
      dto.serviceOrderId ?? null,
      dto.activity ?? null,
    );

    // Open and rejected entries never count as coverage and are never touched.
    const overlapping = await this.prisma.timeEntry.findMany({
      where: {
        employeeId: dto.employeeId,
        status: { not: 'Rejected' },
        clockIn: { lt: to },
        clockOut: { not: null, gt: from },
      },
      orderBy: { clockIn: 'asc' },
    });
    this.assertRangeCovered(from, to, overlapping);

    const schedule = await this.schedules.resolveForEmployee(dto.employeeId);
    const requiresFor = (a: Date, b: Date) =>
      requiresSpecialApproval(a, b, schedule.frame);
    const statusFor = (requires: boolean): 'Pending' | 'Approved' =>
      requires ? 'Pending' : 'Approved';

    const ops: Prisma.PrismaPromise<TimeEntry>[] = [];
    const kinds: Array<'updated' | 'created'> = [];
    const push = (
      op: Prisma.PrismaPromise<TimeEntry>,
      kind: 'updated' | 'created',
    ) => {
      ops.push(op);
      kinds.push(kind);
    };
    const newFields = { ...target };

    for (const entry of overlapping) {
      const s = entry.clockIn;
      const e = entry.clockOut as Date;
      const origFields: BookingTarget = {
        projectId: entry.projectId,
        serviceOrderId: entry.serviceOrderId,
        activity: entry.activity,
      };
      const startsBefore = s < from;
      const endsAfter = to < e;

      if (!startsBefore && !endsAfter) {
        // Case A — fully inside: retarget the whole entry (keeps GPS/note).
        push(
          this.prisma.timeEntry.update({
            where: { id: entry.id },
            data: {
              ...newFields,
              requiresApproval: requiresFor(s, e),
              status: statusFor(requiresFor(s, e)),
            },
            include: ENTRY_INCLUDE,
          }),
          'updated',
        );
      } else if (startsBefore && !endsAfter) {
        // Case B — sticks out left: original keeps its booking up to `from`.
        push(
          this.prisma.timeEntry.update({
            where: { id: entry.id },
            data: {
              clockOut: from,
              requiresApproval: requiresFor(s, from),
              status: statusFor(requiresFor(s, from)),
            },
            include: ENTRY_INCLUDE,
          }),
          'updated',
        );
        push(
          this.prisma.timeEntry.create({
            data: {
              employeeId: entry.employeeId,
              clockIn: from,
              clockOut: e,
              source: entry.source,
              requiresApproval: requiresFor(from, e),
              status: statusFor(requiresFor(from, e)),
              ...newFields,
            },
            include: ENTRY_INCLUDE,
          }),
          'created',
        );
      } else if (!startsBefore && endsAfter) {
        // Case C — sticks out right: original (first physical segment, keeps
        // GPS/note) gets the new booking up to `to`; the rest keeps the old one.
        push(
          this.prisma.timeEntry.update({
            where: { id: entry.id },
            data: {
              clockOut: to,
              ...newFields,
              requiresApproval: requiresFor(s, to),
              status: statusFor(requiresFor(s, to)),
            },
            include: ENTRY_INCLUDE,
          }),
          'updated',
        );
        push(
          this.prisma.timeEntry.create({
            data: {
              employeeId: entry.employeeId,
              clockIn: to,
              clockOut: e,
              source: entry.source,
              requiresApproval: requiresFor(to, e),
              status: statusFor(requiresFor(to, e)),
              ...origFields,
            },
            include: ENTRY_INCLUDE,
          }),
          'created',
        );
      } else {
        // Case D — sticks out both sides: old | new | old.
        push(
          this.prisma.timeEntry.update({
            where: { id: entry.id },
            data: {
              clockOut: from,
              requiresApproval: requiresFor(s, from),
              status: statusFor(requiresFor(s, from)),
            },
            include: ENTRY_INCLUDE,
          }),
          'updated',
        );
        push(
          this.prisma.timeEntry.create({
            data: {
              employeeId: entry.employeeId,
              clockIn: from,
              clockOut: to,
              source: entry.source,
              requiresApproval: requiresFor(from, to),
              status: statusFor(requiresFor(from, to)),
              ...newFields,
            },
            include: ENTRY_INCLUDE,
          }),
          'created',
        );
        push(
          this.prisma.timeEntry.create({
            data: {
              employeeId: entry.employeeId,
              clockIn: to,
              clockOut: e,
              source: entry.source,
              requiresApproval: requiresFor(to, e),
              status: statusFor(requiresFor(to, e)),
              ...origFields,
            },
            include: ENTRY_INCLUDE,
          }),
          'created',
        );
      }
    }

    const results = await this.prisma.$transaction(ops);
    results.forEach((row, i) => {
      if (kinds[i] === 'updated') {
        this.events.broadcast('time-entry:updated', {
          id: row.id,
          employeeId: row.employeeId,
          clockOut: row.clockOut?.toISOString() ?? null,
        });
      } else {
        this.events.broadcast('time-entry:created', {
          id: row.id,
          employeeId: row.employeeId,
          clockIn: row.clockIn.toISOString(),
        });
      }
    });
    const entries = results
      .map(toTimeEntryDto)
      .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
    return { entries };
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
  ): Promise<BookingTarget> {
    if (projectId === null) {
      if (serviceOrderId !== null) {
        throw new BadRequestException('serviceOrderId requires a projectId');
      }
      return {
        projectId: null,
        serviceOrderId: null,
        activity: activity ?? null,
      };
    }
    await this.projects.assertBookable(employeeId, projectId);
    const order = await this.projects.resolveServiceOrder(
      projectId,
      serviceOrderId,
    );
    return {
      projectId,
      serviceOrderId: order?.id ?? null,
      activity: activity ?? null,
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

  private assertOwnerOrAdmin(entry: TimeEntry, user: JwtUser): void {
    this.assertSelfOrAdmin(entry.employeeId, user);
  }

  private assertSelfOrAdmin(employeeId: string, user: JwtUser): void {
    const isAdmin = user.role === 'Manager' || user.role === 'HRAdmin';
    if (employeeId !== user.id && !isAdmin) {
      throw new ForbiddenException(
        'Only the owner or a Manager/HRAdmin may modify this entry',
      );
    }
  }

  private async findOrThrow(id: string): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Time entry ${id} not found`);
    return entry;
  }
}

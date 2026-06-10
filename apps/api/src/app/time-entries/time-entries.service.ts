import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TimeEntry } from '@prisma/client';
import { requiresSpecialApproval } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { ProjectsService } from '../projects/projects.service';
import type { JwtUser } from '../auth/jwt.strategy';
import {
  toTimeEntryDto,
  type ClockInDto,
  type SplitTimeEntryDto,
  type SplitTimeEntryResult,
  type TimeEntryDto,
  type UpdateTimeEntryProjectDto,
} from './time-entries.dto';

const PROJECT_SELECT = { select: { code: true, name: true } } as const;

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly schedules: WorkSchedulesService,
    private readonly projects: ProjectsService,
  ) {}

  async list(employeeId: string, from?: Date, to?: Date): Promise<TimeEntryDto[]> {
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
      include: { project: PROJECT_SELECT },
    });
    return rows.map(toTimeEntryDto);
  }

  async clockIn(dto: ClockInDto): Promise<TimeEntryDto> {
    const open = await this.prisma.timeEntry.findFirst({
      where: { employeeId: dto.employeeId, clockOut: null },
    });
    if (open) {
      throw new ConflictException('There is already an open time entry — clock out first');
    }
    if (dto.projectId != null) {
      await this.projects.assertBookable(dto.employeeId, dto.projectId);
    }
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
        projectId: dto.projectId ?? null,
      },
      include: { project: PROJECT_SELECT },
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
      include: { project: PROJECT_SELECT },
    });
    this.events.broadcast('time-entry:updated', {
      id: updated.id,
      employeeId: updated.employeeId,
      clockOut: updated.clockOut?.toISOString() ?? null,
    });
    return toTimeEntryDto(updated);
  }

  /** Sets, changes, or removes (null) the project of an existing entry. */
  async updateProject(
    id: string,
    dto: UpdateTimeEntryProjectDto,
    user: JwtUser,
  ): Promise<TimeEntryDto> {
    if (dto.projectId === undefined) {
      throw new BadRequestException('projectId must be provided (a project id, or null to clear)');
    }
    const entry = await this.findOrThrow(id);
    this.assertOwnerOrAdmin(entry, user);
    this.assertNotApproved(entry);
    if (dto.projectId !== null) {
      await this.projects.assertBookable(entry.employeeId, dto.projectId);
    }
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { projectId: dto.projectId },
      include: { project: PROJECT_SELECT },
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
  async split(id: string, dto: SplitTimeEntryDto, user: JwtUser): Promise<SplitTimeEntryResult> {
    const entry = await this.findOrThrow(id);
    this.assertOwnerOrAdmin(entry, user);
    this.assertNotApproved(entry);
    if (!entry.clockOut) {
      throw new BadRequestException('Open entries cannot be split — clock out first');
    }
    const at = new Date(dto.at);
    if (at.getTime() <= entry.clockIn.getTime() || at.getTime() >= entry.clockOut.getTime()) {
      throw new BadRequestException('Split time must be strictly between clock-in and clock-out');
    }
    // Omitted projectId → the second segment inherits the original project
    // (no re-authorization: the booking was already legitimate). An explicit
    // project is authorized like a fresh booking.
    const secondProjectId = dto.projectId === undefined ? entry.projectId : dto.projectId;
    if (dto.projectId != null) {
      await this.projects.assertBookable(entry.employeeId, dto.projectId);
    }

    const schedule = await this.schedules.resolveForEmployee(entry.employeeId);
    const firstRequires = requiresSpecialApproval(entry.clockIn, at, schedule.frame);
    const secondRequires = requiresSpecialApproval(at, entry.clockOut, schedule.frame);
    // A rejected entry must not be laundered into approved segments.
    const statusFor = (requires: boolean) =>
      entry.status === 'Rejected' ? 'Rejected' : requires ? 'Pending' : 'Approved';

    const [first, second] = await this.prisma.$transaction([
      this.prisma.timeEntry.update({
        where: { id },
        data: {
          clockOut: at,
          requiresApproval: firstRequires,
          status: statusFor(firstRequires),
        },
        include: { project: PROJECT_SELECT },
      }),
      this.prisma.timeEntry.create({
        data: {
          employeeId: entry.employeeId,
          clockIn: at,
          clockOut: entry.clockOut,
          source: entry.source,
          status: statusFor(secondRequires),
          requiresApproval: secondRequires,
          projectId: secondProjectId,
        },
        include: { project: PROJECT_SELECT },
      }),
    ]);

    this.events.broadcast('time-entry:updated', {
      id: first.id,
      employeeId: first.employeeId,
      clockOut: first.clockOut?.toISOString() ?? null,
    });
    this.events.broadcast('time-entry:created', {
      id: second.id,
      employeeId: second.employeeId,
      clockIn: second.clockIn.toISOString(),
    });
    return { first: toTimeEntryDto(first), second: toTimeEntryDto(second) };
  }

  private assertOwnerOrAdmin(entry: TimeEntry, user: JwtUser): void {
    const isAdmin = user.role === 'Manager' || user.role === 'HRAdmin';
    if (entry.employeeId !== user.id && !isAdmin) {
      throw new ForbiddenException('Only the owner or a Manager/HRAdmin may modify this entry');
    }
  }

  private assertNotApproved(entry: TimeEntry): void {
    if (entry.status === 'Approved') {
      throw new ConflictException(
        'Approved entries may already be ERP-exported and cannot be modified',
      );
    }
  }

  private async findOrThrow(id: string): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Time entry ${id} not found`);
    return entry;
  }
}

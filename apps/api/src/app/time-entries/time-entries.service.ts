import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requiresSpecialApproval } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WorkSchedulesService } from '../work-schedules/work-schedules.service';
import { toTimeEntryDto, type ClockInDto, type TimeEntryDto } from './time-entries.dto';

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly schedules: WorkSchedulesService,
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
      },
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
    });
    this.events.broadcast('time-entry:updated', {
      id: updated.id,
      employeeId: updated.employeeId,
      clockOut: updated.clockOut?.toISOString() ?? null,
    });
    return toTimeEntryDto(updated);
  }
}

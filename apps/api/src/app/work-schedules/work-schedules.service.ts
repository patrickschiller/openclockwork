import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { TimeModel, WorkSchedule, WorkScheduleCoreTime } from '@prisma/client';
import {
  BUNDESLAENDER,
  DEFAULT_FRAME,
  WEEKDAYS_MON_TO_FRI,
  holidayProviderFor,
  type Bundesland,
  type CoreTimeWindow,
  type FrameTimeRule,
  type HolidayProvider,
} from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  toScheduleResponse,
  type BulkAssignResult,
  type UpsertWorkScheduleDto,
  type WorkScheduleResponse,
} from './work-schedules.dto';

export interface ResolvedSchedule {
  scheduleId: string | null;
  scheduleName: string;
  frame: FrameTimeRule;
  coreWindows: CoreTimeWindow[];
  /** Working-day weekday bitmask resolved from the schedule (default Mo–Fr). */
  workingDays: number;
  /** Holiday provider for the employee's Bundesland. */
  holidayProvider: HolidayProvider;
  /** Resolved Bundesland code. */
  bundesland: Bundesland;
}

function parseHm(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':');
  return { hour: Number(h), minute: Number(m) };
}

export function toFrameRule(start: string, end: string): FrameTimeRule {
  const s = parseHm(start);
  const e = parseHm(end);
  return { startHour: s.hour, startMinute: s.minute, endHour: e.hour, endMinute: e.minute };
}

export function toCoreWindow(row: WorkScheduleCoreTime): CoreTimeWindow {
  const s = parseHm(row.start);
  const e = parseHm(row.end);
  return {
    startHour: s.hour,
    startMinute: s.minute,
    endHour: e.hour,
    endMinute: e.minute,
    weekdays: row.weekdays,
    label: row.label ?? undefined,
  };
}

@Injectable()
export class WorkSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WorkScheduleResponse[]> {
    const rows = await this.prisma.workSchedule.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        coreTimes: { orderBy: { start: 'asc' } },
        _count: { select: { employees: true } },
      },
    });
    return rows.map((r) => toScheduleResponse(r, r._count.employees));
  }

  async getById(id: string): Promise<WorkScheduleResponse> {
    const row = await this.findOrThrow(id);
    const count = await this.prisma.employee.count({ where: { workScheduleId: id } });
    return toScheduleResponse(row, count);
  }

  async create(dto: UpsertWorkScheduleDto): Promise<WorkScheduleResponse> {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.workSchedule.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      try {
        const created = await tx.workSchedule.create({
          data: {
            name: dto.name,
            description: dto.description ?? null,
            frameStart: dto.frameStart,
            frameEnd: dto.frameEnd,
            isDefault: !!dto.isDefault,
            workingDays: dto.workingDays ?? 31,
            coreTimes: {
              create: dto.coreTimes.map((c) => ({
                label: c.label ?? null,
                start: c.start,
                end: c.end,
                weekdays: c.weekdays,
              })),
            },
          },
          include: { coreTimes: { orderBy: { start: 'asc' } } },
        });
        return toScheduleResponse(created, 0);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(`A schedule named "${dto.name}" already exists`);
        }
        throw err;
      }
    });
  }

  async update(id: string, dto: UpsertWorkScheduleDto): Promise<WorkScheduleResponse> {
    await this.findOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.workSchedule.updateMany({
          where: { isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      await tx.workScheduleCoreTime.deleteMany({ where: { scheduleId: id } });
      try {
        const updated = await tx.workSchedule.update({
          where: { id },
          data: {
            name: dto.name,
            description: dto.description ?? null,
            frameStart: dto.frameStart,
            frameEnd: dto.frameEnd,
            isDefault: !!dto.isDefault,
            workingDays: dto.workingDays ?? 31,
            coreTimes: {
              create: dto.coreTimes.map((c) => ({
                label: c.label ?? null,
                start: c.start,
                end: c.end,
                weekdays: c.weekdays,
              })),
            },
          },
          include: { coreTimes: { orderBy: { start: 'asc' } } },
        });
        const count = await tx.employee.count({ where: { workScheduleId: id } });
        return toScheduleResponse(updated, count);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(`A schedule named "${dto.name}" already exists`);
        }
        throw err;
      }
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.workSchedule.delete({ where: { id } });
  }

  async assignToEmployee(scheduleId: string, employeeId: string): Promise<void> {
    await this.findOrThrow(scheduleId);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { workScheduleId: scheduleId },
    });
  }

  async unassignFromEmployee(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { workScheduleId: null },
    });
  }

  async bulkAssignByTimeModel(
    scheduleId: string,
    timeModel: TimeModel,
    overrideExisting: boolean,
  ): Promise<BulkAssignResult> {
    await this.findOrThrow(scheduleId);
    const where = overrideExisting
      ? { timeModel, isActive: true }
      : { timeModel, isActive: true, workScheduleId: null };
    const result = await this.prisma.employee.updateMany({
      where,
      data: { workScheduleId: scheduleId },
    });
    const totalForModel = await this.prisma.employee.count({
      where: { timeModel, isActive: true },
    });
    return {
      scheduleId,
      assigned: result.count,
      skipped: totalForModel - result.count,
    };
  }

  /**
   * Resolves the active schedule for the given employee:
   * 1. Employee.workScheduleId — if set
   * 2. The schedule with isDefault = true — fallback
   * 3. Built-in DEFAULT_FRAME with no core windows — final fallback
   */
  async resolveForEmployee(employeeId: string): Promise<ResolvedSchedule> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        workSchedule: { include: { coreTimes: { orderBy: { start: 'asc' } } } },
      },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    const bundesland: Bundesland = (BUNDESLAENDER as readonly string[]).includes(
      employee.bundesland,
    )
      ? (employee.bundesland as Bundesland)
      : 'NW';
    const holidayProvider = holidayProviderFor(bundesland);

    const schedule = employee.workSchedule
      ? employee.workSchedule
      : await this.prisma.workSchedule.findFirst({
          where: { isDefault: true },
          include: { coreTimes: { orderBy: { start: 'asc' } } },
        });
    if (!schedule) {
      return {
        scheduleId: null,
        scheduleName: 'Built-in default',
        frame: DEFAULT_FRAME,
        coreWindows: [],
        workingDays: WEEKDAYS_MON_TO_FRI,
        holidayProvider,
        bundesland,
      };
    }
    return {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      frame: toFrameRule(schedule.frameStart, schedule.frameEnd),
      coreWindows: schedule.coreTimes.map(toCoreWindow),
      workingDays: schedule.workingDays,
      holidayProvider,
      bundesland,
    };
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.workSchedule.findUnique({
      where: { id },
      include: { coreTimes: { orderBy: { start: 'asc' } } },
    });
    if (!row) throw new NotFoundException(`WorkSchedule ${id} not found`);
    return row;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

// Re-export for downstream services that need the Prisma row → domain conversions.
export type { WorkSchedule };

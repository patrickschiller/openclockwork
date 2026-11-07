import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EmployeeContractPeriod, Prisma } from '@prisma/client';
import type { JwtUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmContractPeriodDto,
  EmployeeContractPeriodDto,
} from './contract-periods.dto';

const DAY_MS = 86_400_000;
function dateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value < '0001-01-01'
  )
    throw new BadRequestException('Invalid contract calendar date');
  return date;
}
export function toContractPeriodDto(
  period: EmployeeContractPeriod,
): EmployeeContractPeriodDto {
  return {
    id: period.id,
    employeeId: period.employeeId,
    effectiveFrom: period.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: period.effectiveTo?.toISOString().slice(0, 10) ?? null,
    employmentStart: period.employmentStart.toISOString().slice(0, 10),
    employmentEnd: period.employmentEnd?.toISOString().slice(0, 10) ?? null,
    weeklyHours: Number(period.weeklyHours),
    timeModel: period.timeModel,
    workingDays: period.workingDays,
    holidayCalendar: period.holidayCalendar,
    holidayDates: period.holidayDates,
    scheduleLabel: period.scheduleLabel,
    confirmationNote: period.confirmationNote,
    confirmedById: period.confirmedById,
    revision: period.revision,
    createdAt: period.createdAt.toISOString(),
  };
}

@Injectable()
export class ContractPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    employeeId: string,
    actor: JwtUser,
  ): Promise<EmployeeContractPeriodDto[]> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertHr(tx, actor);
        if (
          !(await tx.employee.findUnique({
            where: { id: employeeId },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Employee not found');
        return (
          await tx.employeeContractPeriod.findMany({
            where: { employeeId },
            orderBy: { effectiveFrom: 'asc' },
          })
        ).map(toContractPeriodDto);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async confirm(
    employeeId: string,
    dto: ConfirmContractPeriodDto,
    actor: JwtUser,
  ): Promise<EmployeeContractPeriodDto> {
    const effectiveFrom = dateOnly(dto.effectiveFrom);
    const effectiveTo =
      dto.effectiveTo == null ? null : dateOnly(dto.effectiveTo);
    const employmentStart = dateOnly(dto.employmentStart);
    const employmentEnd =
      dto.employmentEnd == null ? null : dateOnly(dto.employmentEnd);
    dto.holidayDates.forEach(dateOnly);
    if (dto.confirmed !== true || dto.confirmationNote.trim().length < 5)
      throw new BadRequestException(
        'Explicit HR confirmation and source note are required',
      );
    if (
      (effectiveTo && effectiveTo < effectiveFrom) ||
      (employmentEnd && employmentEnd < employmentStart)
    )
      throw new BadRequestException('Contract date bounds are reversed');
    const workingDayCount = Array.from({ length: 7 }, (_, bit) =>
      Number(Boolean(dto.workingDays & (1 << bit))),
    ).reduce((a, b) => a + b, 0);
    if (
      dto.weeklyHours > 0 &&
      (!workingDayCount || dto.weeklyHours / workingDayCount > 24)
    )
      throw new BadRequestException(
        'Weekly hours cannot exceed 24 hours per working day',
      );
    if (
      (dto.supersedesPeriodId !== undefined) !==
      (dto.expectedRevision !== undefined)
    )
      throw new BadRequestException(
        'Supersession requires both period and expected revision',
      );
    return this.prisma.$transaction(async (tx) => {
      // Same cross-instance lock order as time capture and profile changes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))`;
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId}::uuid FOR UPDATE`;
      await this.assertHr(tx, actor);
      if (
        !(await tx.employee.findUnique({
          where: { id: employeeId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Employee not found');
      const periods = await tx.employeeContractPeriod.findMany({
        where: { employeeId },
      });
      const previous = dto.supersedesPeriodId
        ? periods.find((period) => period.id === dto.supersedesPeriodId)
        : undefined;
      if (
        dto.supersedesPeriodId &&
        (!previous ||
          previous.revision !== dto.expectedRevision ||
          previous.effectiveFrom >= effectiveFrom ||
          (previous.effectiveTo && previous.effectiveTo < effectiveFrom))
      )
        throw new ConflictException(
          'The period changed or cannot be superseded at this date; reload the history',
        );
      if (
        periods.some(
          (period) =>
            period.id !== previous?.id &&
            (!effectiveTo || period.effectiveFrom <= effectiveTo) &&
            (!period.effectiveTo || period.effectiveTo >= effectiveFrom),
        )
      )
        throw new ConflictException(
          'Contract periods must not overlap; explicitly supersede the covering period',
        );
      if (previous) {
        const result = await tx.employeeContractPeriod.updateMany({
          where: { id: previous.id, revision: dto.expectedRevision },
          data: {
            effectiveTo: new Date(effectiveFrom.getTime() - DAY_MS),
            revision: { increment: 1 },
          },
        });
        if (result.count !== 1)
          throw new ConflictException('Contract history changed; reload');
        const after = await tx.employeeContractPeriod.findUniqueOrThrow({
          where: { id: previous.id },
        });
        await tx.employeeContractPeriodAudit.create({
          data: {
            periodId: previous.id,
            actorId: actor.id,
            action: 'Superseded',
            before: toContractPeriodDto(
              previous,
            ) as unknown as Prisma.InputJsonObject,
            after: toContractPeriodDto(
              after,
            ) as unknown as Prisma.InputJsonObject,
          },
        });
      }
      const period = await tx.employeeContractPeriod.create({
        data: {
          employeeId,
          effectiveFrom,
          effectiveTo,
          employmentStart,
          employmentEnd,
          weeklyHours: dto.weeklyHours,
          timeModel: dto.timeModel,
          workingDays: dto.workingDays,
          holidayCalendar: dto.holidayCalendar,
          holidayDates: [...dto.holidayDates].sort(),
          scheduleLabel: dto.scheduleLabel?.trim() || null,
          confirmationNote: dto.confirmationNote.trim(),
          confirmedById: actor.id,
        },
      });
      const after = toContractPeriodDto(period);
      await tx.employeeContractPeriodAudit.create({
        data: {
          periodId: period.id,
          actorId: actor.id,
          action: 'Confirmed',
          after: after as unknown as Prisma.InputJsonObject,
        },
      });
      return after;
    });
  }

  private async assertHr(tx: Prisma.TransactionClient, identity: JwtUser) {
    const settings = await tx.installationSettings.findUnique({
      where: { id: 1 },
    });
    if (settings?.mode === 'Solo')
      throw new ForbiddenException(
        'Contract history management is a Team capability',
      );
    const actor = await tx.employee.findUnique({
      where: { id: identity.id },
      select: { role: true, isActive: true, authVersion: true },
    });
    if (
      !actor?.isActive ||
      actor.role !== 'HRAdmin' ||
      actor.authVersion !== (identity.authVersion ?? 0)
    )
      throw new ForbiddenException(
        'Only active HR may confirm contract history',
      );
  }
}

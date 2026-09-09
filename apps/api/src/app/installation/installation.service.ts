import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type PersonalDay, type SoloPolicy } from '@prisma/client';
import { parseBreakRules, type BreakRule } from 'shared';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChangeModeDto,
  EditPersonalDayDto,
  PersonalDayDto,
  UpdateSoloSettingsDto,
} from './installation.dto';
import {
  parsePersonalWindows,
  validatePersonalFrame,
  type PersonalCoreWindow,
} from './personal-windows';

export const INSTALLATION_LOCK = 7261500;
export const DEFAULT_SOLO_POLICY = {
  targetEnabled: false,
  weeklyTargetMinutes: null as number | null,
  workingDays: 31,
  leaveEnabled: false,
  annualLeaveDays: 0,
  holidayCalendar: 'NONE',
  holidayDates: [] as string[],
  carryOverDays: 0,
  carryOverExpiresOn: null as Date | null,
  leaveAdjustmentDays: 0,
  leaveAdjustmentReason: null as string | null,
  leaveAllowanceYear: new Date().getFullYear(),
  breakRules: [] as BreakRule[],
  coreTimeHintsEnabled: false,
  dailyBlockEnabled: false,
  gpsEnabled: false,
  frameStart: '00:00',
  frameEnd: '23:59',
  coreTimes: [] as PersonalCoreWindow[],
};

export function dateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Invalid calendar date');
  }
  return parsed;
}
export function localDate(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function policyValue(row: SoloPolicy | null) {
  if (!row)
    return {
      ...DEFAULT_SOLO_POLICY,
      id: null as string | null,
      effectiveFrom: null as string | null,
    };
  return {
    ...row,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    annualLeaveDays: Number(row.annualLeaveDays),
    carryOverDays: Number(row.carryOverDays),
    carryOverExpiresOn:
      row.carryOverExpiresOn?.toISOString().slice(0, 10) ?? null,
    leaveAdjustmentDays: Number(row.leaveAdjustmentDays),
    leaveAllowanceYear:
      row.leaveAllowanceYear ?? row.effectiveFrom.getUTCFullYear(),
    breakRules: parseBreakRules(row.breakRules),
    coreTimes: parsePersonalWindows(row.coreTimes),
  };
}
function dayValue(row: PersonalDay) {
  return {
    ...row,
    from: row.from.toISOString().slice(0, 10),
    to: row.to.toISOString().slice(0, 10),
  };
}

@Injectable()
export class InstallationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tx: Prisma.TransactionClient = this.prisma) {
    return (
      (await tx.installationSettings.findUnique({ where: { id: 1 } })) ?? {
        id: 1,
        mode: 'Team' as const,
        ownerEmployeeId: null,
        setupCompleted: true,
        revision: 0,
      }
    );
  }
  async isSolo(): Promise<boolean> {
    return (await this.getSettings()).mode === 'Solo';
  }

  async assertActorAccess(employeeId: string): Promise<void> {
    const [actor, settings] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
      this.getSettings(),
    ]);
    if (!actor?.isActive)
      throw new UnauthorizedException('Account is no longer active');
    if (settings.mode === 'Solo' && settings.ownerEmployeeId !== employeeId)
      throw new ForbiddenException('Solo owner access required');
  }

  async requireOwner(
    employeeId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const [settings, actor] = await Promise.all([
      this.getSettings(tx),
      tx.employee.findUnique({ where: { id: employeeId } }),
    ]);
    if (
      settings.mode !== 'Solo' ||
      settings.ownerEmployeeId !== employeeId ||
      !actor?.isActive ||
      actor.role !== 'HRAdmin'
    ) {
      throw new ForbiddenException('Solo owner access required');
    }
  }

  async policyFor(employeeId: string, at = new Date()) {
    const settings = await this.getSettings();
    const row = await this.prisma.soloPolicy.findFirst({
      where: { employeeId, effectiveFrom: { lte: dateOnly(localDate(at)) } },
      orderBy: [
        { effectiveFrom: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });
    return {
      ...policyValue(row),
      isSolo:
        settings.mode === 'Solo' && settings.ownerEmployeeId === employeeId,
    };
  }

  async getState(actorId: string) {
    await this.assertActorAccess(actorId);
    const settings = await this.getSettings();
    const policy = await this.policyFor(actorId);
    const futurePolicies = await this.prisma.soloPolicy.findMany({
      where: {
        employeeId: actorId,
        effectiveFrom: { gt: dateOnly(localDate()) },
      },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    });
    const isOwner =
      settings.mode === 'Solo' && settings.ownerEmployeeId === actorId;
    return {
      ...settings,
      timeZone:
        process.env.TZ ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'UTC',
      capabilities: {
        isOwner,
        solo: isOwner,
        targets: isOwner && policy.targetEnabled,
        leave: isOwner && policy.leaveEnabled,
        coreTimeHints: isOwner && policy.coreTimeHintsEnabled,
        dailyBlock: isOwner && policy.dailyBlockEnabled && policy.targetEnabled,
        gps: isOwner && policy.gpsEnabled,
      },
      policy,
      futurePolicies: futurePolicies.map(policyValue),
    };
  }

  async saveSettings(actorId: string, dto: UpdateSoloSettingsDto) {
    const effective = dateOnly(dto.effectiveFrom);
    if (effective < dateOnly(localDate()))
      throw new BadRequestException('Policies cannot be changed retroactively');
    if (
      dto.targetEnabled &&
      (!dto.weeklyTargetMinutes || dto.weeklyTargetMinutes <= 0)
    )
      throw new BadRequestException(
        'An enabled target requires positive weekly minutes',
      );
    if (dto.dailyBlockEnabled && !dto.targetEnabled)
      throw new BadRequestException('Daily blocks require an enabled target');
    dto.holidayDates.forEach(dateOnly);
    if (dto.carryOverExpiresOn) dateOnly(dto.carryOverExpiresOn);
    if (dto.leaveAdjustmentDays && !dto.leaveAdjustmentReason?.trim())
      throw new BadRequestException('A leave adjustment requires a reason');
    let rules: BreakRule[];
    try {
      rules = parseBreakRules(dto.breakRules);
    } catch {
      throw new BadRequestException('Invalid break rules');
    }
    const { revision, effectiveFrom: _effectiveFrom, ...fields } = dto;
    void _effectiveFrom;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
      await this.requireOwner(actorId, tx);
      const changed = await tx.installationSettings.updateMany({
        where: { id: 1, revision },
        data: { revision: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException('Settings changed; reload before saving');
      // Once a day has completed work or a personal calendar entry, protect its historical target/calendar.
      if (effective.getTime() === dateOnly(localDate()).getTime()) {
        if (await this.hasAccountingHistory(tx, actorId, effective))
          throw new ConflictException(
            'Today already has recorded work; choose a future effective date',
          );
      }
      const previous = await tx.soloPolicy.findFirst({
        where: { employeeId: actorId, effectiveFrom: { lte: effective } },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      });
      const frameStart =
        fields.frameStart ??
        previous?.frameStart ??
        DEFAULT_SOLO_POLICY.frameStart;
      const frameEnd =
        fields.frameEnd ?? previous?.frameEnd ?? DEFAULT_SOLO_POLICY.frameEnd;
      let coreTimes: PersonalCoreWindow[];
      try {
        coreTimes = parsePersonalWindows(
          fields.coreTimes ?? previous?.coreTimes ?? [],
        );
        validatePersonalFrame(frameStart, frameEnd, coreTimes);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid personal windows',
        );
      }
      const policy = await tx.soloPolicy.create({
        data: {
          ...fields,
          weeklyTargetMinutes: fields.targetEnabled
            ? fields.weeklyTargetMinutes
            : null,
          frameStart,
          frameEnd,
          coreTimes: jsonValue(coreTimes),
          breakRules: jsonValue(rules),
          employeeId: actorId,
          effectiveFrom: effective,
          carryOverExpiresOn: fields.carryOverExpiresOn
            ? dateOnly(fields.carryOverExpiresOn)
            : null,
          leaveAllowanceYear:
            fields.leaveAllowanceYear ?? effective.getUTCFullYear(),
        },
      });
      await tx.installationEvent.create({
        data: {
          actorId,
          action: 'PolicyChanged',
          before: jsonValue(previous),
          after: jsonValue(policy),
        },
      });
    });
    return this.getState(actorId);
  }

  async completeSetup(actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
      await this.requireOwner(actorId, tx);
      await tx.installationSettings.update({
        where: { id: 1 },
        data: { setupCompleted: true, revision: { increment: 1 } },
      });
    });
    return this.getState(actorId);
  }

  private async modeBlockers(
    actorId: string,
    mode: 'Team' | 'Solo',
    tx: Prisma.TransactionClient,
  ) {
    const actor = await tx.employee.findUnique({ where: { id: actorId } });
    if (!actor?.isActive || actor.role !== 'HRAdmin')
      throw new ForbiddenException('Administrator access required');
    const settings = await this.getSettings(tx);
    if (settings.mode === 'Solo' && settings.ownerEmployeeId !== actorId)
      throw new ForbiddenException('Solo owner access required');
    if (settings.mode === mode) return [];
    const blockers: string[] = [];
    if (await tx.timeEntry.count({ where: { clockOut: null, voidedAt: null } }))
      blockers.push('OPEN_TIME_ENTRIES');
    if (mode === 'Solo') {
      if (
        await tx.employee.count({
          where: { isActive: true, id: { not: actorId } },
        })
      )
        blockers.push('OTHER_ACTIVE_EMPLOYEES');
      if (
        await tx.request.count({
          where: {
            workflowState: { notIn: ['Approved', 'Rejected', 'Cancelled'] },
          },
        })
      )
        blockers.push('PENDING_REQUESTS');
      if (
        await tx.timeEntry.count({
          where: { status: 'Pending', voidedAt: null },
        })
      )
        blockers.push('PENDING_TIME_ENTRIES');
      if (await tx.terminal.count({ where: { isActive: true } }))
        blockers.push('ACTIVE_TERMINALS');
    }
    return blockers;
  }

  async previewMode(actorId: string, mode: 'Team' | 'Solo') {
    const blockers = await this.modeBlockers(actorId, mode, this.prisma);
    return { allowed: !blockers.length, blockers };
  }

  async changeMode(actorId: string, dto: ChangeModeDto) {
    await this.prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
          const before = await this.getSettings(tx);
          if (before.revision !== dto.revision)
            throw new ConflictException(
              'Settings changed; reload before switching mode',
            );
          const blockers = await this.modeBlockers(actorId, dto.mode, tx);
          if (blockers.length)
            throw new ConflictException({
              message: 'Resolve pending work before switching mode',
              blockers,
            });
          if (before.mode === dto.mode) return;
          const accountingDate = dateOnly(localDate());
          if (await this.hasAccountingHistory(tx, actorId, accountingDate))
            accountingDate.setUTCDate(accountingDate.getUTCDate() + 1);
          const accountingEffectiveFrom = accountingDate
            .toISOString()
            .slice(0, 10);
          await tx.installationSettings.upsert({
            where: { id: 1 },
            create: { mode: dto.mode, ownerEmployeeId: actorId, revision: 1 },
            update: {
              mode: dto.mode,
              ownerEmployeeId: actorId,
              revision: { increment: 1 },
              setupCompleted: dto.mode === 'Team',
            },
          });
          if (dto.mode === 'Solo') {
            const projects = await tx.project.findMany({
              where: {
                isActive: true,
                OR: [{ customerId: null }, { customer: { isActive: true } }],
              },
              select: { id: true },
            });
            await tx.projectAssignment.createMany({
              data: projects.map((project) => ({
                projectId: project.id,
                employeeId: actorId,
              })),
              skipDuplicates: true,
            });
          }
          if (
            dto.mode === 'Solo' &&
            !(await tx.soloPolicy.count({ where: { employeeId: actorId } }))
          ) {
            const employee = await tx.employee.findUniqueOrThrow({
              where: { id: actorId },
              include: { workSchedule: true },
            });
            const allowance = await tx.employeeLeaveAllowance.findUnique({
              where: {
                employeeId_year: {
                  employeeId: actorId,
                  year: new Date().getFullYear(),
                },
              },
            });
            const isExistingWork =
              (await tx.timeEntry.count({ where: { employeeId: actorId } })) >
              0;
            await tx.soloPolicy.create({
              data: {
                ...DEFAULT_SOLO_POLICY,
                employeeId: actorId,
                effectiveFrom: accountingDate,
                ...(isExistingWork
                  ? {
                      targetEnabled: Number(employee.weeklyHours) > 0,
                      weeklyTargetMinutes: Math.round(
                        Number(employee.weeklyHours) * 60,
                      ),
                      leaveEnabled:
                        Number(
                          allowance?.baseDays ?? employee.annualLeaveDays,
                        ) > 0,
                      annualLeaveDays:
                        allowance?.baseDays ?? employee.annualLeaveDays,
                      carryOverDays: allowance?.carryOverDays ?? 0,
                      carryOverExpiresOn: allowance?.carryOverExpiresOn ?? null,
                      leaveAdjustmentDays: allowance?.adjustmentDays ?? 0,
                      leaveAdjustmentReason:
                        allowance?.adjustmentReason ?? null,
                      holidayCalendar: employee.holidayCalendar,
                      holidayDates: employee.holidayDates,
                      workingDays: employee.workSchedule?.workingDays ?? 31,
                      breakRules: employee.workSchedule?.breakRules ?? [],
                    }
                  : {}),
              },
            });
          }
          await tx.installationEvent.create({
            data: {
              actorId,
              action: 'ModeChanged',
              before: jsonValue(before),
              after: jsonValue({
                mode: dto.mode,
                ownerEmployeeId: actorId,
                accountingEffectiveFrom,
              }),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          throw new ConflictException(
            'Installation changed concurrently; reload before switching mode',
          );
        }
        throw error;
      });
    return this.getState(actorId);
  }

  private async hasAccountingHistory(
    tx: Prisma.TransactionClient,
    actorId: string,
    day: Date,
  ): Promise<boolean> {
    const start = new Date(`${day.toISOString().slice(0, 10)}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [entries, days, legacyAbsences, legacyRequests] = await Promise.all([
      tx.timeEntry.count({
        where: {
          employeeId: actorId,
          clockIn: { lt: end },
          clockOut: { gt: start },
          voidedAt: null,
          status: { not: 'Rejected' },
        },
      }),
      tx.personalDay.count({
        where: {
          employeeId: actorId,
          cancelledAt: null,
          from: { lte: day },
          to: { gte: day },
        },
      }),
      tx.absence.count({
        where: { employeeId: actorId, from: { lte: day }, to: { gte: day } },
      }),
      tx.request.count({
        where: {
          employeeId: actorId,
          workflowState: 'Approved',
          type: { in: ['Vacation', 'SpecialLeave'] },
          from: { lte: day },
          to: { gte: day },
        },
      }),
    ]);
    return Boolean(entries || days || legacyAbsences || legacyRequests);
  }

  async days(actorId: string) {
    await this.requireOwner(actorId);
    return (
      await this.prisma.personalDay.findMany({
        where: { employeeId: actorId },
        orderBy: { from: 'desc' },
      })
    ).map(dayValue);
  }

  async saveDay(
    actorId: string,
    dto: PersonalDayDto | EditPersonalDayDto,
    id?: string,
  ) {
    const from = dateOnly(dto.from),
      to = dateOnly(dto.to);
    if (to < from || to.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException('Invalid personal day range');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
      await this.requireOwner(actorId, tx);
      const before = id
        ? await tx.personalDay.findFirst({
            where: { id, employeeId: actorId, cancelledAt: null },
          })
        : null;
      if (id && !before) throw new NotFoundException('Personal day not found');
      if (before && before.revision !== (dto as EditPersonalDayDto).revision)
        throw new ConflictException(
          'Personal day changed; reload before editing',
        );
      if (
        await tx.personalDay.count({
          where: {
            employeeId: actorId,
            cancelledAt: null,
            from: { lte: to },
            to: { gte: from },
            ...(id ? { id: { not: id } } : {}),
          },
        })
      ) {
        throw new ConflictException('Personal days must not overlap');
      }
      const oldDays = await tx.absence.count({
        where: { employeeId: actorId, from: { lte: to }, to: { gte: from } },
      });
      const oldRequests = await tx.request.count({
        where: {
          employeeId: actorId,
          workflowState: 'Approved',
          type: { in: ['Vacation', 'SpecialLeave'] },
          from: { lte: to },
          to: { gte: from },
        },
      });
      if (oldDays || oldRequests)
        throw new ConflictException(
          'This range overlaps existing historical time off',
        );
      const data = {
        employeeId: actorId,
        kind: dto.kind,
        from,
        to,
        note: dto.note ?? null,
        halfDayStart: dto.halfDayStart ?? false,
        halfDayEnd: dto.halfDayEnd ?? false,
      };
      const after = before
        ? await tx.personalDay.update({
            where: { id },
            data: { ...data, revision: { increment: 1 } },
          })
        : await tx.personalDay.create({ data });
      await tx.installationEvent.create({
        data: {
          actorId,
          action: before ? 'PersonalDayChanged' : 'PersonalDayCreated',
          before: jsonValue(before),
          after: jsonValue(after),
        },
      });
      return dayValue(after);
    });
  }

  async cancelDay(actorId: string, id: string, revision: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_LOCK})`;
      await this.requireOwner(actorId, tx);
      const before = await tx.personalDay.findFirst({
        where: { id, employeeId: actorId, cancelledAt: null },
      });
      if (!before) throw new NotFoundException('Personal day not found');
      if (before.revision !== revision)
        throw new ConflictException(
          'Personal day changed; reload before cancelling',
        );
      const after = await tx.personalDay.update({
        where: { id },
        data: { cancelledAt: new Date(), revision: { increment: 1 } },
      });
      await tx.installationEvent.create({
        data: {
          actorId,
          action: 'PersonalDayCancelled',
          before: jsonValue(before),
          after: jsonValue(after),
        },
      });
      return dayValue(after);
    });
  }

  async events(actorId: string) {
    await this.requireOwner(actorId);
    return this.prisma.installationEvent.findMany({
      where: { actorId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  async dayAudit(actorId: string, id: string) {
    await this.requireOwner(actorId);
    if (
      !(await this.prisma.personalDay.findFirst({
        where: { id, employeeId: actorId },
      }))
    )
      throw new NotFoundException('Personal day not found');
    return this.prisma.installationEvent.findMany({
      where: {
        actorId,
        action: { startsWith: 'PersonalDay' },
        OR: [
          { before: { path: ['id'], equals: id } },
          { after: { path: ['id'], equals: id } },
        ],
      },
      orderBy: { occurredAt: 'asc' },
    });
  }
}

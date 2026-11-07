import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Absence, Prisma } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt.strategy';
import { EmployeesService } from '../employees/employees.service';
import { EventsGateway } from '../events/events.gateway';
import { assertProxyTarget, writeProxyAudit } from '../team-cockpit/team-scope';
import type { ProxyAbsenceDto } from './proxy-absence.dto';
import {
  toAbsenceDto,
  type AbsenceDto,
  type CreateAbsenceDto,
  type UpdateAbsenceDto,
} from './absences.dto';

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly events: EventsGateway,
  ) {}

  async list(
    actor: JwtUser,
    employeeId: string | undefined,
    from?: Date,
    to?: Date,
  ): Promise<AbsenceDto[]> {
    if (employeeId) await this.employees.assertCanRead(employeeId, actor);
    const where: Prisma.AbsenceWhereInput = {
      employee: this.employees.readScope(actor),
    };
    if (employeeId) where.employeeId = employeeId;
    if (from || to) {
      where.OR = [
        // overlap: absence ends after `from` AND starts before `to`
        {
          ...(from ? { to: { gte: from } } : {}),
          ...(to ? { from: { lte: to } } : {}),
        },
      ];
    }
    const rows = await this.prisma.absence.findMany({
      where,
      orderBy: { from: 'desc' },
      take: 500,
    });
    return rows.map(toAbsenceDto);
  }

  async create(actor: JwtUser, dto: CreateAbsenceDto): Promise<AbsenceDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, dto.employeeId);
      await this.assertWritePermission(tx, actor, dto.employeeId);
      const from = this.parseDate(dto.from);
      const to = this.parseDate(dto.to);
      this.assertOrdered(from, to);
      await this.assertNoOverlap(tx, dto.employeeId, from, to);
      return tx.absence.create({
        data: {
          employeeId: dto.employeeId,
          kind: dto.kind ?? 'Sickness',
          from,
          to,
          certified: !!dto.certified,
          note: dto.note ?? null,
        },
      });
    });
    this.emitChange('absence:created', created);
    return toAbsenceDto(created);
  }

  /** Recording is not an application and does not fabricate an approval. */
  async createProxy(
    employeeId: string,
    dto: ProxyAbsenceDto,
    actor: JwtUser,
  ): Promise<AbsenceDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, employeeId);
      const target = await assertProxyTarget(tx, actor, employeeId);
      if (!['Sickness', 'Training', 'Flextime'].includes(dto.kind)) {
        throw new BadRequestException(
          'Only recorded absence kinds may be recorded by proxy',
        );
      }
      if (dto.note != null || dto.certified != null || dto.diagnosis != null) {
        throw new BadRequestException(
          'Medical notes and certification cannot be recorded by proxy',
        );
      }
      const proxyReason =
        typeof dto.proxyReason === 'string' ? dto.proxyReason.trim() : '';
      if (!proxyReason || proxyReason.length < 5 || proxyReason.length > 1000) {
        throw new BadRequestException(
          'proxyReason must contain 5 to 1000 characters',
        );
      }
      const from = this.parseDate(dto.from, true);
      const to = this.parseDate(dto.to, true);
      this.assertOrdered(from, to);
      await this.assertNoOverlap(tx, employeeId, from, to);
      const absence = await tx.absence.create({
        data: {
          employeeId,
          kind: dto.kind,
          from,
          to,
          certified: false,
          note: null,
        },
      });
      await writeProxyAudit(tx, {
        ...target,
        resourceKind: 'Absence',
        resourceId: absence.id,
        action: 'AbsenceRecorded',
        reason: proxyReason,
        values: {
          before: null,
          after: {
            employeeId: absence.employeeId,
            kind: absence.kind,
            from: absence.from.toISOString().slice(0, 10),
            to: absence.to.toISOString().slice(0, 10),
            certified: false,
            note: null,
            createdAt: absence.createdAt.toISOString(),
          },
        },
      });
      return absence;
    });
    this.emitChange('absence:created', created);
    return toAbsenceDto(created);
  }

  async update(
    actor: JwtUser,
    id: string,
    dto: UpdateAbsenceDto,
  ): Promise<AbsenceDto> {
    // Only discover the immutable owner before locking; permission and values
    // are re-read under the same locks as ordinary and proxy creation.
    const owner = await this.assertExists(this.prisma, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, owner.employeeId);
      const existing = await this.assertExists(tx, id);
      await this.assertWritePermission(tx, actor, existing.employeeId);
      const nextFrom =
        dto.from !== undefined ? this.parseDate(dto.from) : existing.from;
      const nextTo =
        dto.to !== undefined ? this.parseDate(dto.to) : existing.to;
      this.assertOrdered(nextFrom, nextTo);
      await this.assertNoOverlap(tx, existing.employeeId, nextFrom, nextTo, id);
      const data: Prisma.AbsenceUpdateInput = {};
      if (dto.from !== undefined) data.from = nextFrom;
      if (dto.to !== undefined) data.to = nextTo;
      if (dto.certified !== undefined) data.certified = dto.certified;
      if (dto.note !== undefined) data.note = dto.note;
      return tx.absence.update({ where: { id }, data });
    });
    this.emitChange('absence:updated', updated);
    return toAbsenceDto(updated);
  }

  async remove(actor: JwtUser, id: string): Promise<void> {
    const owner = await this.assertExists(this.prisma, id);
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, owner.employeeId);
      const existing = await this.assertExists(tx, id);
      await this.assertWritePermission(tx, actor, existing.employeeId);
      return tx.absence.delete({ where: { id } });
    });
    // Consumers invalidate absence lists for either creation or update/removal.
    this.events.broadcast('absence:updated', {
      id: removed.id,
      employeeId: removed.employeeId,
      deleted: true,
    });
  }

  private async lockEmployee(
    tx: Prisma.TransactionClient,
    employeeId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))`;
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId}::uuid FOR NO KEY UPDATE`;
  }

  private async assertExists(
    db: Prisma.TransactionClient,
    id: string,
  ): Promise<Absence> {
    const row = await db.absence.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Absence ${id} not found`);
    return row;
  }

  private async assertWritePermission(
    tx: Prisma.TransactionClient,
    identity: JwtUser,
    targetEmployeeId: string,
  ): Promise<void> {
    const actor = await tx.employee.findUnique({ where: { id: identity.id } });
    if (!actor?.isActive || actor.authVersion !== (identity.authVersion ?? 0)) {
      throw new ForbiddenException('Session no longer valid');
    }
    const employee = await tx.employee.findUnique({
      where: { id: targetEmployeeId },
    });
    if (!employee)
      throw new NotFoundException(`Employee ${targetEmployeeId} not found`);
    if (!employee.isActive)
      throw new ForbiddenException('Employee account is not active');
    const settings = await tx.installationSettings.findUnique({
      where: { id: 1 },
    });
    if (settings?.mode === 'Solo') {
      if (
        settings.ownerEmployeeId === actor.id &&
        actor.role === 'HRAdmin' &&
        employee.id === actor.id
      )
        return;
      throw new ForbiddenException(
        'Solo writes are limited to the active installation owner',
      );
    }
    if (actor.role === 'HRAdmin' || actor.id === employee.id) return;
    if (actor.role === 'Manager' && employee.managerId === actor.id) return;
    throw new ForbiddenException(
      'Only the affected employee, their manager, or an HRAdmin may write this absence',
    );
  }

  private parseDate(value: string, dateOnly = false): Date {
    if (
      typeof value !== 'string' ||
      (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      !isISO8601(value, { strict: true })
    )
      throw new BadRequestException(
        'Absence dates must be valid calendar dates',
      );
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()))
      throw new BadRequestException('Invalid absence date');
    // Prisma stores @db.Date: overlap must use those exact calendar days too,
    // including normal API callers that send a time later than midnight.
    return new Date(`${parsed.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  private assertOrdered(from: Date, to: Date): void {
    if (to < from)
      throw new BadRequestException('"to" must be on/after "from"');
  }

  private emitChange(
    event: 'absence:created' | 'absence:updated',
    absence: Absence,
  ): void {
    // Invalidation carries no medical note, certification or audit reason.
    this.events.broadcast(event, {
      id: absence.id,
      employeeId: absence.employeeId,
    });
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    employeeId: string,
    from: Date,
    to: Date,
    excludeId?: string,
  ): Promise<void> {
    const overlap = await tx.absence.findFirst({
      where: {
        employeeId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        from: { lte: to },
        to: { gte: from },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException(
        'Absence overlaps an existing absence for this employee',
      );
    }
  }
}

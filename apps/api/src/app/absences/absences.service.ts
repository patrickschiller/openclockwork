import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Absence, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt.strategy';
import {
  toAbsenceDto,
  type AbsenceDto,
  type CreateAbsenceDto,
  type UpdateAbsenceDto,
} from './absences.dto';

@Injectable()
export class AbsencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(employeeId: string | undefined, from?: Date, to?: Date): Promise<AbsenceDto[]> {
    const where: Prisma.AbsenceWhereInput = {};
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
    await this.assertWritePermission(actor, dto.employeeId);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('"to" must be on/after "from"');
    }
    const created = await this.prisma.absence.create({
      data: {
        employeeId: dto.employeeId,
        kind: dto.kind ?? 'Sickness',
        from,
        to,
        certified: !!dto.certified,
        note: dto.note ?? null,
      },
    });
    return toAbsenceDto(created);
  }

  async update(actor: JwtUser, id: string, dto: UpdateAbsenceDto): Promise<AbsenceDto> {
    const existing = await this.assertExists(id);
    await this.assertWritePermission(actor, existing.employeeId);
    const data: Prisma.AbsenceUpdateInput = {};
    if (dto.from) data.from = new Date(dto.from);
    if (dto.to) data.to = new Date(dto.to);
    if (dto.certified !== undefined) data.certified = dto.certified;
    if (dto.note !== undefined) data.note = dto.note;
    const next = await this.prisma.absence.update({ where: { id }, data });
    if (next.to.getTime() < next.from.getTime()) {
      // Revert and reject — Prisma allowed the update because we only set one half.
      await this.prisma.absence.update({
        where: { id },
        data: { from: existing.from, to: existing.to },
      });
      throw new BadRequestException('"to" must be on/after "from"');
    }
    return toAbsenceDto(next);
  }

  async remove(actor: JwtUser, id: string): Promise<void> {
    const existing = await this.assertExists(id);
    await this.assertWritePermission(actor, existing.employeeId);
    await this.prisma.absence.delete({ where: { id } });
  }

  private async assertExists(id: string): Promise<Absence> {
    const row = await this.prisma.absence.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Absence ${id} not found`);
    return row;
  }

  private async assertWritePermission(actor: JwtUser, targetEmployeeId: string): Promise<void> {
    if (actor.role === 'HRAdmin') return;
    if (actor.id === targetEmployeeId) return;
    if (actor.role === 'Manager') {
      const target = await this.prisma.employee.findUnique({
        where: { id: targetEmployeeId },
        select: { managerId: true },
      });
      if (target?.managerId === actor.id) return;
    }
    throw new ForbiddenException(
      'Only the affected employee, their manager, or an HRAdmin may write this absence',
    );
  }
}

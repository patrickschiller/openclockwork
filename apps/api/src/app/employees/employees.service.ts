import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Employee, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  toEmployeeDto,
  type CreateEmployeeDto,
  type EmployeeDto,
  type UpdateEmployeeDto,
} from './employees.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { includeInactive?: boolean } = {}): Promise<EmployeeDto[]> {
    const employees = await this.prisma.employee.findMany({
      where: opts.includeInactive ? undefined : { isActive: true },
      include: { workSchedule: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map(toEmployeeDto);
  }

  async getById(id: string): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async getDtoById(id: string): Promise<EmployeeDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { workSchedule: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return toEmployeeDto(employee);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeDto> {
    if (dto.managerId) {
      await this.assertManagerEligible(dto.managerId);
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const created = await this.prisma.employee.create({
        data: {
          personalNo: dto.personalNo,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role,
          timeModel: dto.timeModel,
          weeklyHours: dto.weeklyHours,
          annualLeaveDays: dto.annualLeaveDays,
          startDate: new Date(dto.startDate),
          overtimeOpeningBalanceMinutes: dto.overtimeOpeningBalanceMinutes ?? 0,
          bundesland: dto.bundesland ?? 'NW',
          isActive: true,
          managerId: dto.managerId ?? null,
          workScheduleId: dto.workScheduleId ?? null,
        },
        include: { workSchedule: true },
      });
      return toEmployeeDto(created);
    } catch (err) {
      throw mapPrismaConflict(err);
    }
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    const current = await this.getById(id);
    if (dto.managerId !== undefined && dto.managerId !== null) {
      if (dto.managerId === id) throw new BadRequestException('An employee cannot be their own manager');
      await this.assertManagerEligible(dto.managerId);
    }
    if (dto.isActive === false && current.role === 'HRAdmin') {
      const remaining = await this.prisma.employee.count({
        where: { role: 'HRAdmin', isActive: true, NOT: { id } },
      });
      if (remaining === 0) {
        throw new ForbiddenException('Cannot deactivate the last active HRAdmin');
      }
    }
    const data: Prisma.EmployeeUpdateInput = {};
    if (dto.personalNo !== undefined) data.personalNo = dto.personalNo;
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.email !== undefined) data.email = dto.email.toLowerCase();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.timeModel !== undefined) data.timeModel = dto.timeModel;
    if (dto.weeklyHours !== undefined) data.weeklyHours = dto.weeklyHours;
    if (dto.annualLeaveDays !== undefined) data.annualLeaveDays = dto.annualLeaveDays;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.overtimeOpeningBalanceMinutes !== undefined) {
      data.overtimeOpeningBalanceMinutes = dto.overtimeOpeningBalanceMinutes;
    }
    if (dto.bundesland !== undefined) data.bundesland = dto.bundesland;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.managerId !== undefined) {
      data.manager = dto.managerId ? { connect: { id: dto.managerId } } : { disconnect: true };
    }
    if (dto.workScheduleId !== undefined) {
      data.workSchedule = dto.workScheduleId
        ? { connect: { id: dto.workScheduleId } }
        : { disconnect: true };
    }
    try {
      const updated = await this.prisma.employee.update({
        where: { id },
        data,
        include: { workSchedule: true },
      });
      return toEmployeeDto(updated);
    } catch (err) {
      throw mapPrismaConflict(err);
    }
  }

  async setPassword(id: string, password: string): Promise<void> {
    await this.getById(id);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.employee.update({ where: { id }, data: { passwordHash } });
  }

  async deactivate(id: string): Promise<EmployeeDto> {
    return this.update(id, { isActive: false });
  }

  async reactivate(id: string): Promise<EmployeeDto> {
    return this.update(id, { isActive: true });
  }

  private async assertManagerEligible(managerId: string): Promise<void> {
    const manager = await this.prisma.employee.findUnique({ where: { id: managerId } });
    if (!manager) throw new BadRequestException(`Manager ${managerId} not found`);
    if (!manager.isActive) throw new BadRequestException('Manager must be an active employee');
    if (manager.role !== 'Manager' && manager.role !== 'HRAdmin') {
      throw new BadRequestException('Manager must have role Manager or HRAdmin');
    }
  }
}

function mapPrismaConflict(err: unknown): Error {
  const code = (err as { code?: string }).code;
  if (code === 'P2002') {
    const target = (err as { meta?: { target?: string[] } }).meta?.target?.join(', ');
    return new ConflictException(target ? `Field already in use: ${target}` : 'Unique constraint violated');
  }
  if (code === 'P2025') {
    return new NotFoundException('Referenced record not found');
  }
  return err as Error;
}

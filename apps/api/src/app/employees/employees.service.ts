import { Injectable, NotFoundException } from '@nestjs/common';
import type { Employee } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toEmployeeDto, type EmployeeDto } from './employees.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<EmployeeDto[]> {
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
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
    return toEmployeeDto(await this.getById(id));
  }
}

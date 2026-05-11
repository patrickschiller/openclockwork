import { Injectable } from '@nestjs/common';
import { detectViolations } from 'shared';
import { EmployeesService } from '../employees/employees.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ViolationDto {
  timeEntryId: string;
  employeeId: string;
  kind: string;
  boundary: string;
  deltaMinutes: number;
}

@Injectable()
export class ViolationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async list(employeeId: string, from?: Date, to?: Date): Promise<ViolationDto[]> {
    const employee = await this.employees.getById(employeeId);
    if (employee.timeModel === 'Vertrauensarbeitszeit') return [];

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        employeeId,
        clockIn: from && to ? { gte: from, lte: to } : from ? { gte: from } : to ? { lte: to } : undefined,
      },
      orderBy: { clockIn: 'asc' },
    });

    const out: ViolationDto[] = [];
    for (const e of entries) {
      const violations = detectViolations(e.clockIn, e.clockOut);
      for (const v of violations) {
        out.push({ timeEntryId: e.id, employeeId, ...v });
      }
    }
    return out;
  }
}

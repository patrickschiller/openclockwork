import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { summarize } from 'shared';
import { PrismaService } from '../prisma/prisma.service';

export interface ErpTimeEntryDto {
  id: string;
  employeeId: string;
  personalNo: string;
  clockIn: string;
  clockOut: string;
  netMinutes: number;
}

@Injectable()
export class ErpExportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(from?: Date, to?: Date, page = 1, pageSize = 100): Promise<ErpTimeEntryDto[]> {
    const take = Math.min(Math.max(pageSize, 1), 500);
    const skip = Math.max(0, page - 1) * take;
    const where: Prisma.TimeEntryWhereInput = { status: 'Approved', clockOut: { not: null } };
    if (from || to) {
      where.clockIn = {};
      if (from) (where.clockIn as Prisma.DateTimeFilter).gte = from;
      if (to) (where.clockIn as Prisma.DateTimeFilter).lte = to;
    }
    const rows = await this.prisma.timeEntry.findMany({
      where,
      orderBy: { clockIn: 'asc' },
      include: { employee: { select: { personalNo: true } } },
      skip,
      take,
    });
    return rows
      .filter((r) => r.clockOut !== null)
      .map((r) => {
        const summary = summarize(r.clockIn, r.clockOut);
        return {
          id: r.id,
          employeeId: r.employeeId,
          personalNo: r.employee.personalNo,
          clockIn: r.clockIn.toISOString(),
          clockOut: (r.clockOut as Date).toISOString(),
          netMinutes: summary.netMinutes,
        };
      });
  }
}

import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  WorkingTimeReportDto,
  WorkingTimeReportEmployeeDto,
  WorkingTimeReportQueryDto,
} from './reports.dto';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';
import { SoloReportDto, SoloReportQueryDto } from './reports.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('HRAdmin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('solo')
  @ApiOkResponse({ type: SoloReportDto })
  solo(
    @CurrentUser() user: JwtUser,
    @Query() query: SoloReportQueryDto,
  ): Promise<SoloReportDto> {
    return this.reports.solo(user.id, query);
  }

  @Get('solo.csv')
  @ApiOkResponse({
    description:
      'UTF-8 BOM, semicolon-delimited CSV. Exact minutes; metadata rows state timezone and time definition.',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  async soloCsv(
    @CurrentUser() user: JwtUser,
    @Query() query: SoloReportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.reports.soloCsv(user.id, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="openclockwork-${query.from}-${query.to}.csv"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(csv);
  }

  @Get('working-times/employees')
  @ApiOkResponse({ type: [WorkingTimeReportEmployeeDto] })
  workingTimeEmployees(): Promise<WorkingTimeReportEmployeeDto[]> {
    return this.reports.workingTimeEmployees();
  }

  @Get('working-times')
  @ApiOkResponse({ type: WorkingTimeReportDto })
  workingTimes(
    @Query() query: WorkingTimeReportQueryDto,
  ): Promise<WorkingTimeReportDto> {
    return this.reports.workingTimes(query);
  }
}

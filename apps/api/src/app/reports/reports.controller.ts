import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('HRAdmin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

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

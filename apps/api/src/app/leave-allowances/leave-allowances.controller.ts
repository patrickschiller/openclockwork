import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { LeaveAllowancesService } from './leave-allowances.service';
import { UpsertLeaveAllowanceDto, type LeaveAllowanceDto } from './leave-allowances.dto';

@ApiTags('leave-allowances')
@Controller('employees/:employeeId/leave-allowances')
export class LeaveAllowancesController {
  constructor(private readonly service: LeaveAllowancesService) {}

  @Get()
  list(@Param('employeeId', new ParseUUIDPipe()) employeeId: string): Promise<LeaveAllowanceDto[]> {
    return this.service.list(employeeId);
  }

  @Put(':year')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  upsert(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('year', new ParseIntPipe()) year: number,
    @Body() dto: UpsertLeaveAllowanceDto,
  ): Promise<LeaveAllowanceDto> {
    return this.service.upsert(employeeId, year, dto);
  }
}

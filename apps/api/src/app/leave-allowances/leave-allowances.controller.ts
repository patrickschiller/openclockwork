import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
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

@ApiTags('admin')
@Controller('admin/leave-allowances')
export class LeaveAllowancesAdminController {
  constructor(private readonly service: LeaveAllowancesService) {}

  /**
   * Idempotent cron-friendly endpoint. Recommended invocation: once per day
   * shortly after midnight UTC by an external scheduler (k8s CronJob, host
   * cron, GitHub Actions cron) with `Authorization: Bearer <HR token>`.
   */
  @Post('expire-carryovers')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  expireCarryOvers(): Promise<{ scanned: number; expired: number }> {
    return this.service.expireCarryOvers();
  }
}

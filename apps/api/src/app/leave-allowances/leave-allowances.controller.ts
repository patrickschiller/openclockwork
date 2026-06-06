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
import { CronKeyGuard } from './cron-key.guard';
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
   * Idempotent admin endpoint. HR users can trigger an ad-hoc cleanup
   * (e.g. after editing carry-over expiry dates) — for the unattended
   * scheduled run, see CronCarryOverController below.
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

@ApiTags('cron')
@Controller('cron')
export class CronCarryOverController {
  constructor(private readonly service: LeaveAllowancesService) {}

  /**
   * X-Cron-Key-protected version of expire-carryovers — called by the
   * scheduled ACA Job (infra/azure/main.bicep, every day at 02:00 UTC).
   * Same idempotent behaviour, no JWT round-trip required.
   */
  @Post('expire-carryovers')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CronKeyGuard)
  expireCarryOvers(): Promise<{ scanned: number; expired: number }> {
    return this.service.expireCarryOvers();
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { ViolationsService, type ViolationDto } from './violations.service';

@ApiTags('violations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('violations')
export class ViolationsController {
  constructor(private readonly violations: ViolationsService) {}

  @Get()
  list(
    @Query('employeeId') employeeId: string,
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ViolationDto[]> {
    return this.violations.list(
      employeeId,
      user,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }
}

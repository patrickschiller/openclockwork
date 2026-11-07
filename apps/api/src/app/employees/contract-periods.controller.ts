import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ConfirmContractPeriodDto,
  EmployeeContractPeriodDto,
} from './contract-periods.dto';
import { ContractPeriodsService } from './contract-periods.service';

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('HRAdmin')
@Controller('employees/:id/contract-periods')
export class ContractPeriodsController {
  constructor(private readonly contracts: ContractPeriodsService) {}
  @Get()
  @ApiOkResponse({ type: [EmployeeContractPeriodDto] })
  list(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.contracts.list(id, actor);
  }
  @Post()
  @ApiCreatedResponse({ type: EmployeeContractPeriodDto })
  confirm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmContractPeriodDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.contracts.confirm(id, dto, actor);
  }
}

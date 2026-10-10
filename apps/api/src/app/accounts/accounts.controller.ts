import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { EmployeesService } from '../employees/employees.service';
import { AccountsService } from './accounts.service';
import { VacationBalanceService } from './vacation-balance.service';
import type { AccountDto, VacationBalanceDto } from './accounts.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly vacation: VacationBalanceService,
    private readonly employees: EmployeesService,
  ) {}

  @Get(':employeeId')
  account(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<AccountDto> {
    return this.accounts.account(employeeId, user);
  }

  @Get(':employeeId/vacation')
  async vacationBalance(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @CurrentUser() user: JwtUser,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ): Promise<VacationBalanceDto> {
    await this.employees.assertCanRead(employeeId, user);
    return this.vacation.compute(
      employeeId,
      year ?? new Date().getUTCFullYear(),
    );
  }
}

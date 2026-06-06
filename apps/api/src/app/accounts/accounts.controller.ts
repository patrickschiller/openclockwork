import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { VacationBalanceService } from './vacation-balance.service';
import type { AccountDto, VacationBalanceDto } from './accounts.dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly vacation: VacationBalanceService,
  ) {}

  @Get(':employeeId')
  account(@Param('employeeId', new ParseUUIDPipe()) employeeId: string): Promise<AccountDto> {
    return this.accounts.account(employeeId);
  }

  @Get(':employeeId/vacation')
  vacationBalance(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ): Promise<VacationBalanceDto> {
    return this.vacation.compute(employeeId, year ?? new Date().getUTCFullYear());
  }
}

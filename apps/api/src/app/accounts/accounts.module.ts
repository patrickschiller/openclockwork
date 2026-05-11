import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveAllowancesModule } from '../leave-allowances/leave-allowances.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { VacationBalanceService } from './vacation-balance.service';

@Module({
  imports: [EmployeesModule, LeaveAllowancesModule],
  controllers: [AccountsController],
  providers: [AccountsService, VacationBalanceService],
  exports: [VacationBalanceService],
})
export class AccountsModule {}

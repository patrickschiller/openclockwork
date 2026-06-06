import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveAllowancesModule } from '../leave-allowances/leave-allowances.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [EmployeesModule, AccountsModule, LeaveAllowancesModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}

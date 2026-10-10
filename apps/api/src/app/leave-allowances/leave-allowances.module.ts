import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesModule } from '../employees/employees.module';
import { CronKeyGuard } from './cron-key.guard';
import {
  CronCarryOverController,
  LeaveAllowancesAdminController,
  LeaveAllowancesController,
} from './leave-allowances.controller';
import { LeaveAllowancesService } from './leave-allowances.service';

@Module({
  imports: [AuthModule, EmployeesModule],
  controllers: [
    LeaveAllowancesController,
    LeaveAllowancesAdminController,
    CronCarryOverController,
  ],
  providers: [LeaveAllowancesService, CronKeyGuard],
  exports: [LeaveAllowancesService],
})
export class LeaveAllowancesModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  LeaveAllowancesAdminController,
  LeaveAllowancesController,
} from './leave-allowances.controller';
import { LeaveAllowancesService } from './leave-allowances.service';

@Module({
  imports: [AuthModule],
  controllers: [LeaveAllowancesController, LeaveAllowancesAdminController],
  providers: [LeaveAllowancesService],
  exports: [LeaveAllowancesService],
})
export class LeaveAllowancesModule {}

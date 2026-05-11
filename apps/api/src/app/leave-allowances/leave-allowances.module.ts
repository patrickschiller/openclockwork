import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaveAllowancesController } from './leave-allowances.controller';
import { LeaveAllowancesService } from './leave-allowances.service';

@Module({
  imports: [AuthModule],
  controllers: [LeaveAllowancesController],
  providers: [LeaveAllowancesService],
  exports: [LeaveAllowancesService],
})
export class LeaveAllowancesModule {}

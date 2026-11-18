import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntryApprovalsService } from './time-entry-approvals.service';
import { TimeEntriesService } from './time-entries.service';

@Module({
  imports: [AuthModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService, TimeEntryApprovalsService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}

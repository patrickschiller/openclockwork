import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

@Module({
  imports: [AuthModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}

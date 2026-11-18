import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimeEntriesModule } from '../time-entries/time-entries.module';
import { RequestsModule } from '../requests/requests.module';
import { AbsencesModule } from '../absences/absences.module';
import { TeamCockpitController } from './team-cockpit.controller';
import { TeamCockpitService } from './team-cockpit.service';

@Module({
  imports: [AuthModule, TimeEntriesModule, RequestsModule, AbsencesModule],
  controllers: [TeamCockpitController],
  providers: [TeamCockpitService],
})
export class TeamCockpitModule {}

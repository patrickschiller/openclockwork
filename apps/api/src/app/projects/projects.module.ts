import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { SoloProjectAccessGuard } from './solo-project-access.guard';

// Global so TimeEntriesService can validate project bookings without an
// explicit module import (same pattern as WorkSchedulesModule).
@Global()
@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, SoloProjectAccessGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}

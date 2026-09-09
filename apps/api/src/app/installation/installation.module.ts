import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';
import { PersonalSummaryService } from './personal-summary.service';
import { PersonalHintsService } from './personal-hints.service';
import { SoloAccessGuard } from './solo-access.guard';

@Global()
@Module({
  controllers: [InstallationController],
  providers: [
    InstallationService,
    PersonalSummaryService,
    PersonalHintsService,
    { provide: APP_GUARD, useClass: SoloAccessGuard },
  ],
  exports: [InstallationService],
})
export class InstallationModule {}

import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TerminalDeviceGuard } from './terminal-device.guard';
import { TerminalRateLimitGuard } from './terminal-rate-limit.guard';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';

import { TerminalAuditService } from './terminal-audit.service';
import { TerminalPinService } from './terminal-pin.service';
import { TerminalCredentialsService } from './terminal-credentials.service';
import { TerminalCredentialsController } from './terminal-credentials.controller';
import { TerminalAuthService } from './terminal-auth.service';
import { TerminalAuthController } from './terminal-auth.controller';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [
    TerminalAuthController,
    TerminalCredentialsController,
    TerminalsController,
  ],
  providers: [
    TerminalsService,
    TerminalDeviceGuard,
    TerminalRateLimitGuard,
    TerminalAuditService,
    TerminalPinService,
    TerminalCredentialsService,
    TerminalAuthService,
  ],
  exports: [TerminalAuditService],
})
export class TerminalsModule {}

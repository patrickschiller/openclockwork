import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TerminalDeviceGuard } from './terminal-device.guard';
import { TerminalRateLimitGuard } from './terminal-rate-limit.guard';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';

@Module({
  imports: [AuthModule],
  controllers: [TerminalsController],
  providers: [TerminalsService, TerminalDeviceGuard, TerminalRateLimitGuard],
})
export class TerminalsModule {}

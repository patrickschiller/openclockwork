import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; service: string; utcTimestamp: string } {
    return {
      status: 'ok',
      service: 'openclockwork-api',
      utcTimestamp: new Date().toISOString(),
    };
  }
}

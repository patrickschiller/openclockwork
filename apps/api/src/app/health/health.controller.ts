import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { APP_VERSION } from '../app-version';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'openclockwork-api' })
  service!: string;

  @ApiProperty({ example: '1.4.0' })
  version!: string;

  @ApiProperty({ format: 'date-time' })
  utcTimestamp!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @ApiOkResponse({ type: HealthResponseDto })
  @Get()
  check(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'openclockwork-api',
      version: APP_VERSION,
      utcTimestamp: new Date().toISOString(),
    };
  }
}

import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentTerminalDevice } from './current-terminal-device.decorator';
import {
  TerminalDeviceGuard,
  type TerminalDevicePrincipal,
} from './terminal-device.guard';
import {
  BookTerminalDto,
  BookTerminalResultDto,
  IdentifyChallengeDto,
  IdentifyTerminalDto,
  IdentifyTerminalResultDto,
  TerminalAuditPageDto,
  TerminalAuditQueryDto,
} from './terminal-auth.dto';
import { TerminalAuthService } from './terminal-auth.service';
import { TerminalAuditService } from './terminal-audit.service';

interface LimitResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags('terminal-auth')
@ApiBearerAuth()
@Controller('terminals')
export class TerminalAuthController {
  constructor(
    private readonly auth: TerminalAuthService,
    private readonly audit: TerminalAuditService,
  ) {}
  private async limitedResponse<T>(
    response: LimitResponse,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        response.setHeader('Retry-After', '60');
      throw error;
    }
  }
  @Post('kiosk/challenge')
  @UseGuards(TerminalDeviceGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: IdentifyChallengeDto })
  challenge(
    @CurrentTerminalDevice() device: TerminalDevicePrincipal,
    @Res({ passthrough: true }) response: LimitResponse,
  ) {
    return this.limitedResponse(response, () => this.auth.challenge(device));
  }
  @Post('kiosk/identify')
  @UseGuards(TerminalDeviceGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: IdentifyTerminalResultDto })
  identify(
    @Body() dto: IdentifyTerminalDto,
    @CurrentTerminalDevice() device: TerminalDevicePrincipal,
    @Res({ passthrough: true }) response: LimitResponse,
  ) {
    return this.limitedResponse(response, () =>
      this.auth.identify(dto, device),
    );
  }
  @Post('kiosk/book')
  @UseGuards(TerminalDeviceGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: BookTerminalResultDto })
  book(
    @Body() dto: BookTerminalDto,
    @CurrentTerminalDevice() device: TerminalDevicePrincipal,
    @Res({ passthrough: true }) response: LimitResponse,
  ) {
    return this.limitedResponse(response, () => this.auth.book(dto, device));
  }
  @Get('audit-events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TerminalAuditPageDto })
  events(@Query() query: TerminalAuditQueryDto, @CurrentUser() user: JwtUser) {
    return this.audit.list(query, user.id);
  }
}

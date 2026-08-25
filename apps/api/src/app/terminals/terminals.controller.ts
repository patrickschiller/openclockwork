import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CurrentTerminalDevice } from './current-terminal-device.decorator';
import {
  CreateTerminalDto,
  KioskStateDto,
  PairedTerminalDto,
  PairingCodeDto,
  PairTerminalDto,
  ScanTerminalDto,
  ScanTerminalResultDto,
  SupportPromptDto,
  TerminalDto,
  UpdateTerminalDto,
} from './terminals.dto';
import {
  TerminalDeviceGuard,
  type TerminalDevicePrincipal,
} from './terminal-device.guard';
import {
  TerminalRateLimit,
  TerminalRateLimitGuard,
} from './terminal-rate-limit.guard';
import { TerminalsService } from './terminals.service';

@ApiTags('terminals')
@Controller('terminals')
export class TerminalsController {
  constructor(private readonly terminals: TerminalsService) {}

  @Get('support-prompt')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @ApiOkResponse({ type: SupportPromptDto })
  supportPrompt(): Promise<SupportPromptDto> {
    return this.terminals.supportPrompt();
  }

  @Post('support-prompt/dismiss')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @ApiCreatedResponse({ type: SupportPromptDto })
  dismissSupportPrompt(): Promise<SupportPromptDto> {
    return this.terminals.dismissSupportPrompt();
  }

  @Post('pair')
  @UseGuards(TerminalRateLimitGuard)
  @TerminalRateLimit('pair')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiCreatedResponse({ type: PairedTerminalDto })
  pair(@Body() dto: PairTerminalDto): Promise<PairedTerminalDto> {
    return this.terminals.pair(dto);
  }

  @Get('kiosk')
  @ApiBearerAuth()
  @UseGuards(TerminalDeviceGuard, TerminalRateLimitGuard)
  @TerminalRateLimit('kiosk')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiOkResponse({ type: KioskStateDto })
  kiosk(
    @CurrentTerminalDevice() device: TerminalDevicePrincipal,
  ): Promise<KioskStateDto> {
    return this.terminals.kioskState(device);
  }

  @Post('scan')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TerminalRateLimitGuard)
  @TerminalRateLimit('scan')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiCreatedResponse({ type: ScanTerminalResultDto })
  scan(
    @Body() dto: ScanTerminalDto,
    @CurrentUser() user: JwtUser,
  ): Promise<ScanTerminalResultDto> {
    return this.terminals.scan(dto, user.id);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiOkResponse({ type: [TerminalDto] })
  list(): Promise<TerminalDto[]> {
    return this.terminals.list();
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiCreatedResponse({ type: TerminalDto })
  create(@Body() dto: CreateTerminalDto): Promise<TerminalDto> {
    return this.terminals.create(dto);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @ApiOkResponse({ type: TerminalDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<TerminalDto> {
    return this.terminals.get(id);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @ApiOkResponse({ type: TerminalDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTerminalDto,
  ): Promise<TerminalDto> {
    return this.terminals.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @ApiOkResponse({ type: TerminalDto })
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TerminalDto> {
    return this.terminals.deactivate(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @ApiNoContentResponse({
    description:
      'Permanently deletes the terminal and kiosk-only data. Historical time entries remain.',
  })
  async deletePermanently(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.terminals.deletePermanently(id);
  }

  @Post(':id/pairing')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiCreatedResponse({ type: PairingCodeDto })
  createPairing(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PairingCodeDto> {
    return this.terminals.createPairing(id);
  }

  @Delete(':id/devices/:deviceId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @ApiOkResponse({ type: TerminalDto })
  revokeDevice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ): Promise<TerminalDto> {
    return this.terminals.revokeDevice(id, deviceId);
  }
}

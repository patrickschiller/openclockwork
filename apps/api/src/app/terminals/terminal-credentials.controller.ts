import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
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
import {
  ResetTerminalPinResultDto,
  TerminalCredentialStatusDto,
} from './terminal-auth.dto';
import { TerminalCredentialsService } from './terminal-credentials.service';

@ApiTags('terminal-credentials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('HRAdmin')
@Controller('employees/:id/terminal-credentials')
export class TerminalCredentialsController {
  constructor(private readonly credentials: TerminalCredentialsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TerminalCredentialStatusDto })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.credentials.get(id, user.id);
  }
  @Post('pin/reset')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: ResetTerminalPinResultDto })
  reset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.credentials.reset(id, user.id);
  }
  @Delete('pin')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: TerminalCredentialStatusDto })
  revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.credentials.change(id, user.id, false);
  }
  @Post('pin/unlock')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: TerminalCredentialStatusDto })
  unlock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.credentials.change(id, user.id, true);
  }
}

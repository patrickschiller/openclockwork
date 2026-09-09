import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import {
  ChangeModeDto,
  EditPersonalDayDto,
  PersonalDayDto,
  PreviewModeDto,
  RevisionDto,
  UpdateSoloSettingsDto,
} from './installation.dto';
import { InstallationService } from './installation.service';
import { PersonalSummaryService } from './personal-summary.service';
import {
  PersonalHintsDto,
  PersonalHintsService,
} from './personal-hints.service';
import {
  InstallationAuditResponse,
  InstallationStateResponse,
  ModePreviewResponse,
  PersonalDayResponse,
  PersonalSummaryResponse,
} from './installation.response';

@ApiTags('installation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('installation')
export class InstallationController {
  constructor(
    private readonly installation: InstallationService,
    private readonly summary: PersonalSummaryService,
    private readonly personalHints: PersonalHintsService,
  ) {}
  @Get('hints') @ApiOkResponse({ type: PersonalHintsDto }) hints(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.personalHints.hints(user.id, from, to);
  }
  @Get() @ApiOkResponse({ type: InstallationStateResponse }) get(
    @CurrentUser() user: JwtUser,
  ) {
    return this.installation.getState(user.id);
  }
  @Patch('settings')
  @ApiOkResponse({ type: InstallationStateResponse })
  settings(@CurrentUser() user: JwtUser, @Body() dto: UpdateSoloSettingsDto) {
    return this.installation.saveSettings(user.id, dto);
  }
  @Post('complete-setup')
  @ApiCreatedResponse({ type: InstallationStateResponse })
  complete(@CurrentUser() user: JwtUser) {
    return this.installation.completeSetup(user.id);
  }
  @Post('mode-preview')
  @ApiCreatedResponse({ type: ModePreviewResponse })
  preview(@CurrentUser() user: JwtUser, @Body() dto: PreviewModeDto) {
    return this.installation.previewMode(user.id, dto.mode);
  }
  @Post('mode') @ApiCreatedResponse({ type: InstallationStateResponse }) mode(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangeModeDto,
  ) {
    return this.installation.changeMode(user.id, dto);
  }
  @Get('days') @ApiOkResponse({ type: [PersonalDayResponse] }) days(
    @CurrentUser() user: JwtUser,
  ) {
    return this.installation.days(user.id);
  }
  @Post('days') @ApiCreatedResponse({ type: PersonalDayResponse }) createDay(
    @CurrentUser() user: JwtUser,
    @Body() dto: PersonalDayDto,
  ) {
    return this.installation.saveDay(user.id, dto);
  }
  @Patch('days/:id') @ApiOkResponse({ type: PersonalDayResponse }) updateDay(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditPersonalDayDto,
  ) {
    return this.installation.saveDay(user.id, dto, id);
  }
  @Delete('days/:id') @ApiOkResponse({ type: PersonalDayResponse }) cancelDay(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.installation.cancelDay(user.id, id, dto.revision);
  }
  @Get('events') @ApiOkResponse({ type: [InstallationAuditResponse] }) events(
    @CurrentUser() user: JwtUser,
  ) {
    return this.installation.events(user.id);
  }
  @Get('days/:id/audit')
  @ApiOkResponse({ type: [InstallationAuditResponse] })
  dayAudit(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.installation.dayAudit(user.id, id);
  }
  @Get('summary') @ApiOkResponse({ type: PersonalSummaryResponse }) totals(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.summary.summary(user.id, from, to);
  }
}

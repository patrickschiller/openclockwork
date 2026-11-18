import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TimeEntriesService } from '../time-entries/time-entries.service';
import { TimeEntryDto } from '../time-entries/time-entries.dto';
import {
  ProxyClockInDto,
  ProxyManualTimeEntryDto,
} from '../time-entries/proxy-time-entry.dto';
import { RequestsService } from '../requests/requests.service';
import { RequestDto } from '../requests/requests.dto';
import { ProxyRequestDto } from '../requests/proxy-request.dto';
import { AbsencesService } from '../absences/absences.service';
import { ProxyAbsenceDto } from '../absences/proxy-absence.dto';
import { BookableProjectDto } from '../projects/projects.dto';
import {
  CockpitRecordedAbsenceDto,
  CockpitHistoryDto,
  CockpitHistoryQueryDto,
  TeamCockpitDto,
} from './team-cockpit.dto';
import { TeamCockpitService } from './team-cockpit.service';

@ApiTags('team-cockpit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Manager', 'HRAdmin')
@Controller('team-cockpit')
export class TeamCockpitController {
  constructor(
    private readonly cockpit: TeamCockpitService,
    private readonly entries: TimeEntriesService,
    private readonly requests: RequestsService,
    private readonly absences: AbsencesService,
  ) {}
  @Get()
  @ApiOkResponse({ type: TeamCockpitDto })
  overview(@CurrentUser() actor: JwtUser) {
    return this.cockpit.overview(actor);
  }
  @Get('approval-requests')
  @ApiOkResponse({ type: RequestDto, isArray: true })
  approvalRequests(@CurrentUser() actor: JwtUser) {
    return this.cockpit.approvalRequests(actor);
  }
  @Get('employees/:id/history')
  @ApiOkResponse({ type: CockpitHistoryDto })
  history(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: CockpitHistoryQueryDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.cockpit.history(id, query, actor);
  }
  @Get('employees/:id/booking-targets')
  @ApiOkResponse({ type: BookableProjectDto, isArray: true })
  bookingTargets(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.cockpit.bookingTargets(id, actor);
  }
  @Post('employees/:id/clock-in')
  @ApiCreatedResponse({ type: TimeEntryDto })
  clockIn(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProxyClockInDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.entries.proxyClockIn(id, dto, actor);
  }
  @Post('employees/:id/manual')
  @ApiCreatedResponse({ type: TimeEntryDto })
  manual(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProxyManualTimeEntryDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.entries.proxyManual(id, dto, actor);
  }
  @Post('employees/:id/requests')
  @ApiCreatedResponse({ type: RequestDto })
  request(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProxyRequestDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.requests.createProxy(id, dto, actor);
  }
  @Post('employees/:id/absences')
  @ApiCreatedResponse({ type: CockpitRecordedAbsenceDto })
  absence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProxyAbsenceDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.absences.createProxy(id, dto, actor);
  }
}

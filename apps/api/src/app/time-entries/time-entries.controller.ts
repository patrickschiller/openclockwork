import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';
import { TimeEntriesService } from './time-entries.service';
import {
  BookProjectRangeDto,
  ClockInDto,
  ClockOutDto,
  CreateDailyBlockDto,
  DailyBlockOptionDto,
  ManualTimeEntryDto,
  CorrectTimeEntryDto,
  VoidTimeEntryDto,
  SwitchProjectDto,
  TimeEntryAuditDto,
  SplitTimeEntryDto,
  UpdateTimeEntryDto,
  BookProjectRangeResult,
  SplitTimeEntryResult,
  TimeEntryDto,
} from './time-entries.dto';

@ApiTags('time-entries')
@Controller('timeentries')
export class TimeEntriesController {
  constructor(private readonly entries: TimeEntriesService) {}

  @Get()
  @ApiOkResponse({ type: TimeEntryDto, isArray: true })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  list(
    @Query('employeeId', new ParseUUIDPipe()) employeeId: string,
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<TimeEntryDto[]> {
    return this.entries.list(
      employeeId,
      user,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post('clock-in')
  @ApiCreatedResponse({ type: TimeEntryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  clockIn(
    @Body() dto: ClockInDto,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryDto> {
    return this.entries.clockIn(dto, user.id);
  }

  @Post('clock-out')
  @ApiCreatedResponse({ type: TimeEntryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  clockOut(
    @Body() dto: ClockOutDto,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryDto> {
    return this.entries.clockOut(user.id, dto);
  }

  @Get('daily-block/option')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: DailyBlockOptionDto })
  dailyBlockOption(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
  ): Promise<DailyBlockOptionDto> {
    return this.entries.dailyBlockOption(user.id, date);
  }

  @Post('daily-block')
  @ApiCreatedResponse({ type: TimeEntryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  dailyBlock(
    @Body() dto: CreateDailyBlockDto,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryDto> {
    return this.entries.createDailyBlock(dto, user);
  }

  // Static route — keep declared before the ':id' routes.
  @Post('book-project')
  @ApiCreatedResponse({ type: BookProjectRangeResult })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  bookProject(
    @Body() dto: BookProjectRangeDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookProjectRangeResult> {
    return this.entries.bookProjectRange(dto, user);
  }

  @Post('manual')
  @ApiCreatedResponse({ type: TimeEntryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  manual(
    @Body() dto: ManualTimeEntryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryDto> {
    return this.entries.createManual(dto, user);
  }

  @Patch(':id/correct')
  @ApiOkResponse({ type: TimeEntryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  correct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CorrectTimeEntryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryDto> {
    return this.entries.correct(id, dto, user);
  }

  @Post(':id/void')
  @ApiCreatedResponse({ type: TimeEntryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  voidEntry(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VoidTimeEntryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryDto> {
    return this.entries.voidEntry(id, dto, user);
  }

  @Post(':id/switch-project')
  @ApiCreatedResponse({ type: SplitTimeEntryResult })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  switchProject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SwitchProjectDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SplitTimeEntryResult> {
    return this.entries.switchProject(id, dto, user);
  }

  @Get(':id/audit')
  @ApiBearerAuth()
  @ApiOkResponse({ type: TimeEntryAuditDto, isArray: true })
  @UseGuards(JwtAuthGuard)
  audit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryAuditDto[]> {
    return this.entries.audit(id, user);
  }

  @Patch(':id')
  @ApiOkResponse({ type: TimeEntryDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTimeEntryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryDto> {
    return this.entries.update(id, dto, user);
  }

  @Post(':id/split')
  @ApiCreatedResponse({ type: SplitTimeEntryResult })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  split(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SplitTimeEntryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SplitTimeEntryResult> {
    return this.entries.split(id, dto, user);
  }
}

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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';
import { TimeEntriesService } from './time-entries.service';
import {
  BookProjectRangeDto,
  ClockInDto,
  ClockOutDto,
  SplitTimeEntryDto,
  UpdateTimeEntryDto,
  type BookProjectRangeResult,
  type SplitTimeEntryResult,
  type TimeEntryDto,
} from './time-entries.dto';

@ApiTags('time-entries')
@Controller('timeentries')
export class TimeEntriesController {
  constructor(private readonly entries: TimeEntriesService) {}

  @Get()
  list(
    @Query('employeeId') employeeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<TimeEntryDto[]> {
    return this.entries.list(
      employeeId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post('clock-in')
  clockIn(@Body() dto: ClockInDto): Promise<TimeEntryDto> {
    return this.entries.clockIn(dto);
  }

  @Post('clock-out')
  clockOut(@Body() dto: ClockOutDto): Promise<TimeEntryDto> {
    return this.entries.clockOut(dto.employeeId);
  }

  // Static route — keep declared before the ':id' routes.
  @Post('book-project')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  bookProject(
    @Body() dto: BookProjectRangeDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BookProjectRangeResult> {
    return this.entries.bookProjectRange(dto, user);
  }

  @Patch(':id')
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

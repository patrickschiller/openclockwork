import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TimeEntriesService } from './time-entries.service';
import { ClockInDto, ClockOutDto, type TimeEntryDto } from './time-entries.dto';

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
}

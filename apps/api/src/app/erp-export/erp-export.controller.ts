import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './api-key.guard';
import { ErpExportService, type ErpTimeEntryDto } from './erp-export.service';

@ApiTags('erp')
@Controller('erp')
export class ErpExportController {
  constructor(private readonly service: ErpExportService) {}

  @Get('timeentries')
  @UseGuards(ApiKeyGuard)
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ): Promise<ErpTimeEntryDto[]> {
    return this.service.list(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      page ?? 1,
      pageSize ?? 100,
    );
  }
}

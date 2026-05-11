import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { WorkSchedulesService } from './work-schedules.service';
import {
  AssignToEmployeeDto,
  BulkAssignDto,
  UpsertWorkScheduleDto,
  type BulkAssignResult,
  type WorkScheduleResponse,
} from './work-schedules.dto';

@ApiTags('work-schedules')
@Controller('work-schedules')
export class WorkSchedulesController {
  constructor(private readonly schedules: WorkSchedulesService) {}

  @Get()
  list(): Promise<WorkScheduleResponse[]> {
    return this.schedules.list();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<WorkScheduleResponse> {
    return this.schedules.getById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  create(@Body() dto: UpsertWorkScheduleDto): Promise<WorkScheduleResponse> {
    return this.schedules.create(dto);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertWorkScheduleDto,
  ): Promise<WorkScheduleResponse> {
    return this.schedules.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.schedules.remove(id);
  }

  @Post(':id/assign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignToEmployeeDto,
  ): Promise<void> {
    return this.schedules.assignToEmployee(id, dto.employeeId);
  }

  @Post(':id/bulk-assign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  bulkAssign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BulkAssignDto,
  ): Promise<BulkAssignResult> {
    return this.schedules.bulkAssignByTimeModel(id, dto.timeModel, !!dto.overrideExisting);
  }
}

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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { AbsencesService } from './absences.service';
import {
  CreateAbsenceDto,
  UpdateAbsenceDto,
  type AbsenceDto,
} from './absences.dto';

@ApiTags('absences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('absences')
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  @Get()
  list(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<AbsenceDto[]> {
    return this.absences.list(
      employeeId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAbsenceDto): Promise<AbsenceDto> {
    return this.absences.create(user, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAbsenceDto,
  ): Promise<AbsenceDto> {
    return this.absences.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.absences.remove(user, id);
  }
}

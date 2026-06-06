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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  SetPasswordDto,
  UpdateEmployeeDto,
  type EmployeeDto,
} from './employees.dto';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string): Promise<EmployeeDto[]> {
    return this.employees.list({ includeInactive: includeInactive === 'true' });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<EmployeeDto> {
    return this.employees.getDtoById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeDto> {
    return this.employees.create(dto);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeDto> {
    return this.employees.update(id, dto);
  }

  @Post(':id/password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    return this.employees.setPassword(id, dto.password);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string): Promise<EmployeeDto> {
    return this.employees.deactivate(id);
  }

  @Post(':id/reactivate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HRAdmin')
  reactivate(@Param('id', new ParseUUIDPipe()) id: string): Promise<EmployeeDto> {
    return this.employees.reactivate(id);
  }
}

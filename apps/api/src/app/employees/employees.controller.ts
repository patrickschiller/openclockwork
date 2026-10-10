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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  EmployeeDirectoryDto,
  SetPasswordDto,
  UpdateEmployeeDto,
  type EmployeeDto,
} from './employees.dto';

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<EmployeeDto[]> {
    return this.employees.listForActor(user, {
      includeInactive: includeInactive === 'true',
    });
  }

  // Static route before ':id'; authenticated names without personnel details.
  @Get('directory')
  @ApiOkResponse({ type: [EmployeeDirectoryDto] })
  directory(): Promise<EmployeeDirectoryDto[]> {
    return this.employees.directory();
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<EmployeeDto> {
    await this.employees.assertCanRead(id, user);
    return this.employees.getDtoById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('HRAdmin')
  create(@Body() dto: CreateEmployeeDto): Promise<EmployeeDto> {
    return this.employees.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('HRAdmin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeDto> {
    return this.employees.update(id, dto);
  }

  @Post(':id/password')
  @UseGuards(RolesGuard)
  @Roles('HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    return this.employees.setPassword(id, dto.password);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('HRAdmin')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EmployeeDto> {
    return this.employees.deactivate(id);
  }

  @Post(':id/reactivate')
  @UseGuards(RolesGuard)
  @Roles('HRAdmin')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EmployeeDto> {
    return this.employees.reactivate(id);
  }
}

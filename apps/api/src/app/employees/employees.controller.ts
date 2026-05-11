import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import type { EmployeeDto } from './employees.dto';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(): Promise<EmployeeDto[]> {
    return this.employees.list();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<EmployeeDto> {
    return this.employees.getDtoById(id);
  }
}

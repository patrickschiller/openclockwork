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
import { ProjectsService } from './projects.service';
import {
  UpsertProjectDto,
  UpsertServiceOrderDto,
  type BookableProjectDto,
  type ProjectAssignmentDto,
  type ProjectDto,
  type ServiceOrderDto,
} from './projects.dto';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string): Promise<ProjectDto[]> {
    return this.projects.list(includeInactive === 'true');
  }

  // Static routes must be declared before ':id' — Nest matches in
  // declaration order and ParseUUIDPipe would reject them with a 400.
  @Get('assignments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  listAssignments(): Promise<ProjectAssignmentDto[]> {
    return this.projects.listAssignments();
  }

  @Get('bookable')
  listBookable(
    @Query('employeeId', new ParseUUIDPipe()) employeeId: string,
  ): Promise<BookableProjectDto[]> {
    return this.projects.listBookable(employeeId);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProjectDto> {
    return this.projects.getById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  create(@Body() dto: UpsertProjectDto): Promise<ProjectDto> {
    return this.projects.create(dto);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertProjectDto,
  ): Promise<ProjectDto> {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.projects.remove(id);
  }

  @Post(':id/service-orders')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  createServiceOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertServiceOrderDto,
  ): Promise<ServiceOrderDto> {
    return this.projects.createServiceOrder(id, dto);
  }

  @Put(':id/service-orders/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  updateServiceOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: UpsertServiceOrderDto,
  ): Promise<ServiceOrderDto> {
    return this.projects.updateServiceOrder(id, orderId, dto);
  }

  @Delete(':id/service-orders/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeServiceOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
  ): Promise<void> {
    return this.projects.removeServiceOrder(id, orderId);
  }

  @Put(':id/assignments/:employeeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ): Promise<void> {
    return this.projects.assign(id, employeeId);
  }

  @Delete(':id/assignments/:employeeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ): Promise<void> {
    return this.projects.unassign(id, employeeId);
  }
}

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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';
import { SoloProjectAccessGuard } from './solo-project-access.guard';
import {
  UpsertProjectDto,
  UpsertServiceOrderDto,
  BookableProjectDto,
  type ProjectAssignmentDto,
  ProjectDto,
  type ProjectReportDto,
  ServiceOrderDto,
} from './projects.dto';

@ApiTags('projects')
@Controller('projects')
@UseGuards(SoloProjectAccessGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOkResponse({ type: [ProjectDto] })
  list(
    @Query('includeInactive') includeInactive?: string,
  ): Promise<ProjectDto[]> {
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
  @ApiOkResponse({ type: [BookableProjectDto] })
  listBookable(
    @Query('employeeId', new ParseUUIDPipe()) employeeId: string,
  ): Promise<BookableProjectDto[]> {
    return this.projects.listBookable(employeeId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProjectDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProjectDto> {
    return this.projects.getById(id);
  }

  @Get(':id/report')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  report(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ProjectReportDto> {
    return this.projects.report(
      id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post()
  @ApiCreatedResponse({ type: ProjectDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  create(
    @Body() dto: UpsertProjectDto,
    @CurrentUser() user: JwtUser,
  ): Promise<ProjectDto> {
    return this.projects.create(dto, user);
  }

  @Put(':id')
  @ApiOkResponse({ type: ProjectDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertProjectDto,
    @CurrentUser() user: JwtUser,
  ): Promise<ProjectDto> {
    return this.projects.update(id, dto, user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    return this.projects.remove(id, user);
  }

  @Post(':id/service-orders')
  @ApiCreatedResponse({ type: ServiceOrderDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  createServiceOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertServiceOrderDto,
    @CurrentUser() user: JwtUser,
  ): Promise<ServiceOrderDto> {
    return this.projects.createServiceOrder(id, dto, user);
  }

  @Put(':id/service-orders/:orderId')
  @ApiOkResponse({ type: ServiceOrderDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  updateServiceOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: UpsertServiceOrderDto,
    @CurrentUser() user: JwtUser,
  ): Promise<ServiceOrderDto> {
    return this.projects.updateServiceOrder(id, orderId, dto, user);
  }

  @Delete(':id/service-orders/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeServiceOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    return this.projects.removeServiceOrder(id, orderId, user);
  }

  @Put(':id/assignments/:employeeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    return this.projects.assign(id, employeeId, user);
  }

  @Delete(':id/assignments/:employeeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Manager', 'HRAdmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    return this.projects.unassign(id, employeeId, user);
  }
}

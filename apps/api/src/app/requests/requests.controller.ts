import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestsService } from './requests.service';
import {
  CreateRequestDto,
  CreateVacationDto,
  ManagerApproveDto,
  TransitionDto,
  TransitionWithRequiredNoteDto,
  type RequestDto,
  type RequestEventDto,
} from './requests.dto';

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Get()
  list(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('workflowState') workflowState?: string,
    @Query('approverId') approverId?: string,
    @Query('currentApproverId') currentApproverId?: string,
    @Query('substituteId') substituteId?: string,
  ): Promise<RequestDto[]> {
    return this.service.list({ employeeId, status, workflowState, approverId, currentApproverId, substituteId });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<RequestDto> {
    return this.service.getById(id);
  }

  @Get(':id/events')
  events(@Param('id', new ParseUUIDPipe()) id: string): Promise<RequestEventDto[]> {
    return this.service.events(id);
  }

  @Post()
  create(@Body() dto: CreateRequestDto): Promise<RequestDto> {
    return this.service.create(dto);
  }

  @Post('vacation')
  createVacation(@Body() dto: CreateVacationDto): Promise<RequestDto> {
    return this.service.createVacation(dto);
  }

  // ----- Generic approve / reject (legacy convenience) -----

  @Post(':id/approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: TransitionDto): Promise<RequestDto> {
    return this.service.approve(id, body.actorId, body.note ?? null);
  }

  @Post(':id/reject')
  reject(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: TransitionDto): Promise<RequestDto> {
    return this.service.reject(id, body.actorId, body.note ?? null);
  }

  // ----- Vacation workflow -----

  @Post(':id/manager-approve')
  managerApprove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ManagerApproveDto,
  ): Promise<RequestDto> {
    return this.service.managerApprove(id, body.actorId, body.note ?? null, !!body.requiresHrConfirmation);
  }

  @Post(':id/manager-reject')
  managerReject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
  ): Promise<RequestDto> {
    return this.service.managerReject(id, body.actorId, body.note ?? null);
  }

  @Post(':id/hr-confirm')
  hrConfirm(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: TransitionDto): Promise<RequestDto> {
    return this.service.hrConfirm(id, body.actorId, body.note ?? null);
  }

  @Post(':id/hr-reject')
  hrReject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
  ): Promise<RequestDto> {
    return this.service.hrReject(id, body.actorId, body.note);
  }

  @Post(':id/substitute/accept')
  substituteAccept(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
  ): Promise<RequestDto> {
    return this.service.substituteAccept(id, body.actorId, body.note ?? null);
  }

  @Post(':id/substitute/decline')
  substituteDecline(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
  ): Promise<RequestDto> {
    return this.service.substituteDecline(id, body.actorId, body.note);
  }

  @Post(':id/return')
  returnForRevision(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
  ): Promise<RequestDto> {
    return this.service.returnForRevision(id, body.actorId, body.note);
  }

  @Post(':id/cancel')
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: TransitionDto): Promise<RequestDto> {
    return this.service.cancel(id, body.actorId, body.note ?? null);
  }
}

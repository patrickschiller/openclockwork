import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { RequestsService } from './requests.service';
import {
  BulkApproveDto,
  BulkRejectDto,
  CreateRequestDto,
  CreateVacationDto,
  ManagerApproveDto,
  TransitionDto,
  TransitionWithRequiredNoteDto,
  type BulkResult,
  type RequestDto,
  type RequestEventDto,
} from './requests.dto';

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
    return this.service.list({
      employeeId,
      status,
      workflowState,
      approverId,
      currentApproverId,
      substituteId,
    });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<RequestDto> {
    return this.service.getById(id);
  }

  @Get(':id/events')
  events(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RequestEventDto[]> {
    return this.service.events(id);
  }

  @Post()
  create(
    @Body() dto: CreateRequestDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.create({ ...dto, employeeId: user.id });
  }

  @Post('vacation')
  createVacation(
    @Body() dto: CreateVacationDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.createVacation({ ...dto, employeeId: user.id });
  }

  // ----- Generic approve / reject (legacy convenience) -----

  @Post(':id/approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.approve(id, user.id, body.note ?? null);
  }

  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.reject(id, user.id, body.note ?? null);
  }

  // ----- Vacation workflow -----

  @Post(':id/manager-approve')
  managerApprove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ManagerApproveDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.managerApprove(
      id,
      user.id,
      body.note ?? null,
      !!body.requiresHrConfirmation,
    );
  }

  @Post(':id/manager-reject')
  managerReject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.managerReject(id, user.id, body.note ?? null);
  }

  @Post(':id/hr-confirm')
  hrConfirm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.hrConfirm(id, user.id, body.note ?? null);
  }

  @Post(':id/hr-reject')
  hrReject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.hrReject(id, user.id, body.note);
  }

  @Post(':id/substitute/accept')
  substituteAccept(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.substituteAccept(id, user.id, body.note ?? null);
  }

  @Post(':id/substitute/decline')
  substituteDecline(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.substituteDecline(id, user.id, body.note);
  }

  @Post(':id/return')
  returnForRevision(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.returnForRevision(id, user.id, body.note);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.cancel(id, user.id, body.note ?? null);
  }

  // ----- Bulk -----

  @Post('bulk-approve')
  bulkApprove(
    @Body() body: BulkApproveDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BulkResult[]> {
    return this.service.bulkApprove(
      user.id,
      body.ids,
      body.note ?? null,
      !!body.requiresHrConfirmation,
    );
  }

  @Post('bulk-reject')
  bulkReject(
    @Body() body: BulkRejectDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BulkResult[]> {
    return this.service.bulkReject(user.id, body.ids, body.note);
  }
}

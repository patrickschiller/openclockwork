import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import {
  TimeEntryDto,
  TimeEntryAuditDto,
} from '../time-entries/time-entries.dto';
import { RequestsService } from './requests.service';
import {
  BulkApproveDto,
  BulkRejectDto,
  CreateRequestDto,
  CreateVacationDto,
  ManagerApproveDto,
  TransitionDto,
  UpdateDraftRequestDto,
  TransitionWithRequiredNoteDto,
  type BulkResult,
  RequestDto,
  type RequestEventDto,
} from './requests.dto';

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Get()
  @ApiOkResponse({ type: RequestDto, isArray: true })
  list(
    @CurrentUser() user: JwtUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('workflowState') workflowState?: string,
    @Query('approverId') approverId?: string,
    @Query('currentApproverId') currentApproverId?: string,
    @Query('substituteId') substituteId?: string,
  ): Promise<RequestDto[]> {
    return this.service.list(
      {
        employeeId,
        status,
        workflowState,
        approverId,
        currentApproverId,
        substituteId,
      },
      user.id,
    );
  }

  @Get('time-adjustment-targets')
  @ApiOkResponse({ type: TimeEntryDto, isArray: true })
  timeAdjustmentTargets(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<TimeEntryDto[]> {
    return this.service.timeAdjustmentTargets(
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id/time-entry-audit')
  @ApiOkResponse({ type: TimeEntryAuditDto, isArray: true })
  timeEntryAudit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<TimeEntryAuditDto[]> {
    return this.service.timeEntryAudit(id, user.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: RequestDto })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.getById(id, user.id);
  }

  @Get(':id/events')
  events(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestEventDto[]> {
    return this.service.events(id, user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: RequestDto })
  create(
    @Body() dto: CreateRequestDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.create({ ...dto, employeeId: user.id });
  }

  @Post('vacation')
  @ApiCreatedResponse({ type: RequestDto })
  createVacation(
    @Body() dto: CreateVacationDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.createVacation({ ...dto, employeeId: user.id });
  }

  @Patch(':id')
  @ApiOkResponse({ type: RequestDto })
  updateDraft(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDraftRequestDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.updateDraft(id, user.id, dto, false);
  }

  @Post(':id/resubmit')
  @ApiCreatedResponse({ type: RequestDto })
  resubmit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDraftRequestDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.updateDraft(id, user.id, dto, true);
  }

  // ----- Generic approve / reject (legacy convenience) -----

  @Post(':id/approve')
  @ApiCreatedResponse({ type: RequestDto })
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.approve(
      id,
      user.id,
      body.note ?? null,
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/reject')
  @ApiCreatedResponse({ type: RequestDto })
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.reject(
      id,
      user.id,
      body.note ?? null,
      body.expectedUpdatedAt,
    );
  }

  // ----- Vacation workflow -----

  @Post(':id/manager-approve')
  @ApiCreatedResponse({ type: RequestDto })
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
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/manager-reject')
  @ApiCreatedResponse({ type: RequestDto })
  managerReject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.managerReject(
      id,
      user.id,
      body.note ?? null,
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/hr-confirm')
  @ApiCreatedResponse({ type: RequestDto })
  hrConfirm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.hrConfirm(
      id,
      user.id,
      body.note ?? null,
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/hr-reject')
  @ApiCreatedResponse({ type: RequestDto })
  hrReject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.hrReject(
      id,
      user.id,
      body.note,
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/substitute/accept')
  @ApiCreatedResponse({ type: RequestDto })
  substituteAccept(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.substituteAccept(
      id,
      user.id,
      body.note ?? null,
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/substitute/decline')
  @ApiCreatedResponse({ type: RequestDto })
  substituteDecline(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.substituteDecline(
      id,
      user.id,
      body.note,
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/return')
  @ApiCreatedResponse({ type: RequestDto })
  returnForRevision(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionWithRequiredNoteDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.returnForRevision(
      id,
      user.id,
      body.note,
      body.expectedUpdatedAt,
    );
  }

  @Post(':id/cancel')
  @ApiCreatedResponse({ type: RequestDto })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TransitionDto,
    @CurrentUser() user: JwtUser,
  ): Promise<RequestDto> {
    return this.service.cancel(
      id,
      user.id,
      body.note ?? null,
      body.expectedUpdatedAt,
    );
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

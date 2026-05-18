import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtUser } from '../auth/jwt.strategy';
import { AttachmentsService, type AttachmentFile } from './attachments.service';
import type { AttachmentDto } from './attachments.dto';

@ApiTags('attachments')
@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('requests/:requestId/attachments')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: JwtUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @UploadedFile() file: AttachmentFile,
  ): Promise<AttachmentDto> {
    return this.attachments.upload(user, requestId, file);
  }

  @Get('requests/:requestId/attachments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: JwtUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<AttachmentDto[]> {
    return this.attachments.list(user, requestId);
  }

  @Get('attachments/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async download(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, meta } = await this.attachments.download(user, id);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(meta.fileName)}"`,
    );
    res.setHeader('Content-Length', String(meta.sizeBytes));
    stream.pipe(res);
  }

  @Delete('attachments/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.attachments.remove(user, id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/types/auth.types.js';
import { PERMISSIONS } from '../common/constants/permission.constant.js';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AttachmentService } from './attachment.service.js';
import {
  listAttachmentsQuerySchema,
  MAX_FILE_BYTES,
  uploadAttachmentSchema,
  type ListAttachmentsQuery,
  type UploadAttachmentDto,
  type UploadedBlob,
} from './dto/attachment.dto.js';

@Controller('attachments')
export class AttachmentController {
  constructor(private readonly service: AttachmentService) {}

  // multipart/form-data: field "file" + ownerType, ownerId, kind
  @Post()
  @Permissions(PERMISSIONS.ATTACHMENT_UPLOAD.code)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file: UploadedBlob | undefined,
    @Body(new ZodValidationPipe(uploadAttachmentSchema)) dto: UploadAttachmentDto,
  ) {
    return this.service.upload(actor, dto, file);
  }

  @Get()
  @Permissions(PERMISSIONS.CASH_ADVANCE_VIEW.code)
  list(@Query(new ZodValidationPipe(listAttachmentsQuerySchema)) query: ListAttachmentsQuery) {
    return this.service.list(query);
  }

  @Get(':id/file')
  @Permissions(PERMISSIONS.CASH_ADVANCE_VIEW.code)
  async file(@Param('id', ParseIdPipe) id: string) {
    const f = await this.service.open(id);
    return new StreamableFile(f.stream, {
      type: f.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
    });
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ATTACHMENT_UPLOAD.code)
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.service.remove(actor, id);
  }
}

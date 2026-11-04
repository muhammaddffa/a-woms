import { z } from 'zod';
import { uuidSchema } from '../../common/dto/uuid.dto.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ownerTypeSchema = z.enum(['CASH_ADVANCE', 'CASH_ADVANCE_ITEM', 'CASH_ADVANCE_EXTRA_COST', 'ADVANCE_RETURN']);

export const uploadAttachmentSchema = z.object({
  ownerType: ownerTypeSchema,
  ownerId: uuidSchema,
  kind: z.enum(['RECEIPT', 'PHOTO', 'PDF', 'TRANSFER_PROOF']),
});

export const listAttachmentsQuerySchema = z.object({
  ownerType: ownerTypeSchema,
  ownerId: uuidSchema,
});

export type UploadAttachmentDto = z.infer<typeof uploadAttachmentSchema>;
export type ListAttachmentsQuery = z.infer<typeof listAttachmentsQuerySchema>;

// Bentuk file hasil multer (memory storage), tanpa bergantung pada @types/multer.
export interface UploadedBlob {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

import { z } from 'zod';
import { uuidSchema } from '../../common/dto/uuid.dto.js';
import { createWorkOrderItemSchema } from '../../work-order-item/dto/work-order-item.dto.js';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Tanggal tidak valid');

const id = uuidSchema;

export const createWorkOrderSchema = z.object({
  orderDate: dateString,
  customerId: id,
  brand: z.string().trim().max(60).optional(),
  project: z.string().trim().max(120).optional(),
  entityCode: z.string().trim().toUpperCase().max(20).default('AGS'),
  isDummy: z.boolean().default(false),
  costNote: z.string().trim().max(500).optional(),
  items: z.array(createWorkOrderItemSchema).max(100).default([]),
});
export type CreateWorkOrderDto = z.infer<typeof createWorkOrderSchema>;

// Tanpa default di sini agar update parsial tidak menimpa field lain.
export const updateWorkOrderSchema = z
  .object({
    orderDate: dateString.optional(),
    customerId: id.optional(),
    brand: z.string().trim().max(60).nullable().optional(),
    project: z.string().trim().max(120).nullable().optional(),
    entityCode: z.string().trim().toUpperCase().max(20).optional(),
    isDummy: z.boolean().optional(),
    costNote: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Tidak ada data yang diubah' });
export type UpdateWorkOrderDto = z.infer<typeof updateWorkOrderSchema>;

export const cancelWorkOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan minimal 3 karakter').max(255),
});
export type CancelWorkOrderDto = z.infer<typeof cancelWorkOrderSchema>;

export const listWorkOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(64).optional(),
  customerId: uuidSchema.optional(),
  status: z.enum(['OPEN', 'COST_CHECKED', 'COST_APPROVED', 'CLOSED', 'CANCELLED']).optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
});
export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;

import { z } from 'zod';

export const materialStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type MaterialStatus = z.infer<typeof materialStatusSchema>;

export const materialUrgencySchema = z.enum(['normal', 'urgent']);
export type MaterialUrgency = z.infer<typeof materialUrgencySchema>;

export const createMaterialSchema = z.object({
  project_id: z.string().uuid().optional(),
  item: z.string().min(2, 'Le matériau est requis.'),
  quantity: z.number().nonnegative().optional(),
  urgency: materialUrgencySchema.default('normal'),
  note: z.string().optional(),
  status: materialStatusSchema.default('pending'),
});
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = createMaterialSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

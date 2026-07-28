import { z } from 'zod';

export const createSiteLogSchema = z.object({
  project_id: z.string().uuid('Le projet est requis.'),
  photo_path: z.string().min(1, 'La photo est requise.'),
  caption: z.string().optional(),
});

export type CreateSiteLogInput = z.infer<typeof createSiteLogSchema>;

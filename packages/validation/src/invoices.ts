import { z } from 'zod';

/** Doc 06 §6.3 — facture client. */
export const createInvoiceSchema = z.object({
  project_id: z.string().uuid(),
  invoice_number: z.string().min(1, 'Numéro de facture requis.'),
  client_name: z.string().min(2, 'Nom du client requis.'),
  amount: z.number().positive('Le montant doit être positif.'),
  due_date: z.string().date(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceStatusSchema = z.object({
  invoice_id: z.string().uuid(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']),
});
export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>;

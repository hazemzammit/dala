'use server';

import {
  createInvoiceSchema,
  updateInvoiceStatusSchema,
  type CreateInvoiceInput,
  type UpdateInvoiceStatusInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

export async function createInvoice(input: CreateInvoiceInput): Promise<ActionResult> {
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) {
    return { success: false, error: 'Aucune organisation active.' };
  }

  const { error } = await supabase.from('invoices').insert({
    org_id: profile.active_org_id,
    project_id: parsed.data.project_id,
    invoice_number: parsed.data.invoice_number,
    client_name: parsed.data.client_name,
    amount: parsed.data.amount,
    due_date: parsed.data.due_date,
    created_by: user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Ce numéro de facture existe déjà.' };
    }
    return { success: false, error: 'Impossible de créer la facture. Vérifiez vos droits.' };
  }

  revalidatePath('/billing');
  return { success: true };
}

export async function updateInvoiceStatus(input: UpdateInvoiceStatusInput): Promise<ActionResult> {
  const parsed = updateInvoiceStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('invoices')
    .update({
      status: parsed.data.status,
      paid_at: parsed.data.status === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.invoice_id);

  if (error) {
    return { success: false, error: 'Impossible de modifier le statut. Vérifiez vos droits.' };
  }

  revalidatePath('/billing');
  return { success: true };
}

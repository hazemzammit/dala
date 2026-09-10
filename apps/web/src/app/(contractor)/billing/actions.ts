'use server';

import { createInvoiceSchema, type CreateInvoiceInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * Phase 3 — billing rebuilt from scratch against the real create_invoice()
 * RPC (migration 0074), matching mobile's client-portal.tsx invoice-
 * generation flow exactly. The RPC resolves the org from the project
 * itself (org_role_of(lead_org_id)) rather than trusting a client-supplied
 * org id, snapshots project_expenses for the given period into a frozen
 * line_items JSON blob, and enforces owner/manager-only at the DB layer —
 * nothing extra needed client-side beyond passing the four real params
 * through and surfacing the RPC's own error (e.g. insufficient_permissions,
 * invalid_period) if it fails.
 */
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

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { error } = await supabase.rpc('create_invoice', {
    p_project_id: parsed.data.project_id,
    p_period_from: parsed.data.period_from,
    p_period_to: parsed.data.period_to,
    p_due_date: parsed.data.due_date,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    const message = error.message?.includes('insufficient_permissions')
      ? 'Seuls les propriétaires et gestionnaires peuvent générer des factures.'
      : error.message?.includes('invalid_period')
        ? 'La période sélectionnée est invalide.'
        : 'Impossible de générer la facture.';
    return { success: false, error: message };
  }

  revalidatePath('/billing');
  return { success: true };
}

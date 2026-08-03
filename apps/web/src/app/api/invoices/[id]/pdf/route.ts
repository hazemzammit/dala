import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';

import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { createClient } from '@/lib/supabase/server';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
};

/**
 * Route Handler plutôt que Server Action — @react-pdf/renderer produit un
 * buffer binaire, et les Server Actions ne sont pas conçues pour renvoyer
 * des fichiers volumineux au client (Doc: même raisonnement que pour
 * l'upload de photo, déjà géré côté client pour la même raison inverse).
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('invoice_number, client_name, amount, due_date, status, org_id, project_id')
    .eq('id', params.id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', invoice.org_id)
    .single();

  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', invoice.project_id)
    .single();

  const buffer = await renderToBuffer(
    InvoiceDocument({
      organizationName: organization?.name ?? '—',
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      projectName: project?.name ?? '—',
      amount: invoice.amount,
      dueDate: invoice.due_date,
      status: STATUS_LABEL[invoice.status] ?? invoice.status,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="facture-${invoice.invoice_number}.pdf"`,
    },
  });
}

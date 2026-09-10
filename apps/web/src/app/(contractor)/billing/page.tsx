import { redirect } from 'next/navigation';

import { BillingView } from './BillingView';

import { createClient } from '@/lib/supabase/server';

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) redirect('/create-organization');

  const orgId = profile.active_org_id;

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, client_name')
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  const projectIds = (projects ?? []).map((p) => p.id);

  const { data: invoices } = projectIds.length
    ? await supabase
        .from('invoices')
        .select(
          'id, project_id, invoice_number, issued_at, due_date, period_from, period_to, subtotal, notes',
        )
        .in('project_id', projectIds)
        .order('issued_at', { ascending: false })
    : { data: [] };

  return <BillingView projects={projects ?? []} invoices={invoices ?? []} />;
}

import { redirect } from 'next/navigation';

import { SafetyView } from './SafetyView';

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

  const { data: incidents } = await supabase
    .from('safety_incidents')
    .select('id, description, severity, photo_url, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const { data: insurances } = await supabase
    .from('org_insurances')
    .select('id, provider_name, policy_number, expires_at, created_at')
    .eq('org_id', orgId)
    .order('expires_at', { ascending: true });

  const { data: ppeChecklists } = await supabase
    .from('ppe_checklists')
    .select('id, item, compliant, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const { data: riskAlerts } = await supabase
    .from('risk_alerts')
    .select('id, description, severity, status, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  return (
    <SafetyView
      incidents={incidents ?? []}
      insurances={insurances ?? []}
      ppeChecklists={ppeChecklists ?? []}
      riskAlerts={riskAlerts ?? []}
    />
  );
}

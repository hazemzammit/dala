import { redirect } from 'next/navigation';

import { CompanyForm } from './CompanyForm';

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

  const { data: organization } = await supabase
    .from('organizations')
    .select('name, trade_type, address, contact_phone, contact_email')
    .eq('id', profile.active_org_id)
    .single();

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-neutral-900">
          Informations de l&apos;entreprise
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ces informations apparaissent sur vos factures et comptes rendus client.
        </p>
      </div>

      <CompanyForm organization={organization} />
    </div>
  );
}

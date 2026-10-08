import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { CompanyForm } from './CompanyForm';


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
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <CompanyForm organization={organization} />
    </div>
  );
}

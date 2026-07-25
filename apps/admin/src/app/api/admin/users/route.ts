/**
 * Doc 04 §4.3.4 — cross-org user listing.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, last_login_at, suspended_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('user_id, role, organizations(name)');

  const orgsByUser = new Map<string, { name: string; role: string }[]>();
  for (const m of memberships ?? []) {
    const userId = m.user_id as string;
    const list = orgsByUser.get(userId) ?? [];
    list.push({ name: (m as any).organizations?.name ?? '—', role: m.role as string });
    orgsByUser.set(userId, list);
  }

  // Email lives on auth.users, not profiles — fetched once here (rather
  // than per-row) so the Users screen can show it and so the delete
  // confirm-by-typing dialog has the exact string the server will
  // validate against, instead of asking the admin to blind-type it via a
  // native prompt(). perPage: 1000 caps this at 1000 auth users total —
  // fine at current scale; revisit with real pagination once the platform
  // has more users than that.
  const { data: authUsersPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map<string, string>();
  for (const u of authUsersPage?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailById.get(p.id as string) ?? null,
    organizations: orgsByUser.get(p.id as string) ?? [],
  }));

  return NextResponse.json({ users });
}

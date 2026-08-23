/**
 * Doc 04 §4.3.4 — cross-org user listing.
 *
 * Admin remediation Tier 4.1 — pagination. Same `page`/`pageSize`
 * contract as the organizations route. auth.admin.listUsers() stays
 * capped at perPage: 1000 regardless of pagination here — that cap was
 * already a documented, separate limitation (see the comment below it),
 * not something this item's scope covers fixing (Supabase's Auth admin
 * API has no "look up these specific N ids" bulk method to page against
 * instead — it can only page auth.users itself, which isn't ordered the
 * same way as this route's profiles-driven pagination).
 *
 * Admin remediation Tier 4.2 — search. `?q=` matches full_name OR phone
 * (both on `profiles`, searchable via PostgREST directly) OR email.
 * Email needs a separate path: checked first, per the plan's own
 * instruction, rather than assuming the supabase-js client can filter on
 * it directly — `auth.users` isn't in PostgREST's exposed-schema list
 * (same reasoning revoke_sessions, in api/admin/users/[userId]/route.ts,
 * already established for this exact table), so an `.ilike()` against it
 * through the REST client isn't possible at all, and auth.admin.listUsers()
 * has no search/filter parameter in the installed @supabase/auth-js
 * version either (checked, not assumed) — only pagination. So: a direct
 * `pg` pool query (same pool Database Explorer and revoke_sessions use)
 * against `auth.users.email ilike $1` gets the matching ids, which are
 * then OR'd into the profiles query alongside full_name/phone. If that
 * pg query fails for any reason, search degrades to name/phone-only
 * rather than 500ing the whole screen — a partial search result is
 * better than none for what's fundamentally a convenience filter, not a
 * security boundary.
 */
import { NextResponse } from 'next/server';

import { getPgPool } from '@/lib/db-explorer/pg-client';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const DEFAULT_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    200,
    Math.max(
      1,
      Number(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE,
    ),
  );
  const offset = (page - 1) * pageSize;

  const supabase = getAdminSupabaseClient();

  let emailMatchIds: string[] = [];
  if (q) {
    try {
      const result = await getPgPool().query<{ id: string }>(
        'select id from auth.users where email ilike $1',
        [`%${q}%`],
      );
      emailMatchIds = result.rows.map((r) => r.id);
    } catch (err) {
      console.error(
        '[api/admin/users] email search query failed, degrading to name/phone only:',
        err,
      );
    }
  }

  let query = supabase
    .from('profiles')
    .select('id, full_name, phone, last_login_at, suspended_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (q) {
    const orParts = [`full_name.ilike.%${q}%`, `phone.ilike.%${q}%`];
    if (emailMatchIds.length > 0) {
      orParts.push(`id.in.(${emailMatchIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }

  const { data: profiles, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pageUserIds = (profiles ?? []).map((p) => p.id as string);

  // Scoped to this page's users only, same reasoning as organizations'
  // member_counts fix — no reason to read every org_member row on every
  // page load once there's a page to scope to.
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('user_id, role, organizations(name)')
    .in('user_id', pageUserIds.length > 0 ? pageUserIds : ['00000000-0000-0000-0000-000000000000']);

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
  // has more users than that (see this file's header on why this cap
  // wasn't addressed as part of this pagination pass specifically).
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

  return NextResponse.json({ users, page, pageSize, total: count ?? 0 });
}

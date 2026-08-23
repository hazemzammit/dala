/**
 * apps/admin/src/app/api/admin/search/route.ts
 *
 * Doc 04 §4.3 (no dedicated numbered section for this — global search
 * isn't itself a spec'd screen, it's a navigation shortcut across the
 * screens that already are), admin remediation Tier 4.4.
 *
 * `?q=` — three parallel lightweight queries, capped at 5 results each,
 * rather than one combined full-text query: orgs (name), users (name +
 * email — reuses the exact same auth.users pg-pool path
 * api/admin/users/route.ts's Tier 4.2 search already established, not a
 * second implementation of it), and recent audit_log actions (ilike on
 * `action`, most recent 5 matches). Not a full-text/fuzzy search engine —
 * per the plan, that's an explicitly later refinement, not this item's bar.
 *
 * Read-only (Doc 04 §4.3 intro's "Support: read-only everywhere" already
 * covers this) — no requireRole() gate beyond authentication, matching
 * every other GET route in this app.
 */
import { NextResponse } from 'next/server';

import { getPgPool } from '@/lib/db-explorer/pg-client';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const RESULTS_PER_CATEGORY = 5;

export async function GET(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    // Doc 04 §4.3.3/4.3.4's own search inputs have no minimum-length gate
    // (a single-org, low-volume table doesn't need one) — this route is
    // different: it fans out to 3 queries on every keystroke from a
    // command-palette UI, so a 1-character query firing on every load is
    // worth avoiding specifically here.
    return NextResponse.json({ organizations: [], users: [], auditLogEntries: [] });
  }

  const supabase = getAdminSupabaseClient();

  const orgsPromise = supabase
    .from('organizations')
    .select('id, name, plan')
    .ilike('name', `%${q}%`)
    .limit(RESULTS_PER_CATEGORY);

  // Same auth.users pg-pool email-match path as api/admin/users/route.ts
  // (Tier 4.2) — not reusable as a shared function without turning that
  // route's whole search assembly into a general-purpose helper, so this
  // is the one deliberate duplication in this item: the SQL query itself
  // (`select id from auth.users where email ilike $1`) is copied, kept
  // intentionally minimal so there's little for the two copies to drift
  // on. Failure here degrades this category to name-only, same
  // "partial result over broken screen" reasoning as that route.
  const emailMatchIdsPromise = getPgPool()
    .query<{ id: string }>('select id from auth.users where email ilike $1', [`%${q}%`])
    .then((r) => r.rows.map((row) => row.id))
    .catch((err) => {
      console.error('[api/admin/search] email search query failed, degrading to name only:', err);
      return [] as string[];
    });

  const auditLogPromise = supabase
    .from('audit_log')
    .select('id, action, target_table, target_id, created_at')
    .ilike('action', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(RESULTS_PER_CATEGORY);

  const [orgsResult, emailMatchIds, auditLogResult] = await Promise.all([
    orgsPromise,
    emailMatchIdsPromise,
    auditLogPromise,
  ]);

  let usersQuery = supabase
    .from('profiles')
    .select('id, full_name, phone')
    .limit(RESULTS_PER_CATEGORY);

  const orParts = [`full_name.ilike.%${q}%`];
  if (emailMatchIds.length > 0) {
    orParts.push(`id.in.(${emailMatchIds.join(',')})`);
  }
  usersQuery = usersQuery.or(orParts.join(','));

  const { data: usersData } = await usersQuery;

  return NextResponse.json({
    organizations: orgsResult.data ?? [],
    users: usersData ?? [],
    auditLogEntries: auditLogResult.data ?? [],
  });
}

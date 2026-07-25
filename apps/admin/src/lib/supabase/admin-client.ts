/**
 * Service-role Supabase client — SERVER-SIDE ONLY.
 *
 * Doc 04 §4.3 intro: platform admins bypass RLS entirely via a secured
 * internal tool, never via the public API surface. This client is that
 * boundary. It must never be imported from a Client Component, and the
 * service-role key must never be exposed via a NEXT_PUBLIC_ var.
 *
 * Deliberately separate from apps/web's lib/supabase — do not import or
 * reuse that config (see the warning already in the original page.tsx
 * scaffold). Admin's data-access shape (cross-tenant, no org scoping) is
 * fundamentally different from a contractor session.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// TODO: once `supabase gen types typescript --local > packages/shared-types/src/database.ts`
// has been run, replace `any, any, any` with the generated Database type here
// for real column-level type safety. Left as `any` for now — pinning it
// explicitly (rather than leaving the generic at its default) works around a
// postgrest-js quirk where `.eq(...).maybeSingle()`/`.single()` chains
// otherwise infer the result row as `never` with no schema supplied.
let _client: SupabaseClient<any, any, any> | null = null;

export function getAdminSupabaseClient(): SupabaseClient<any, any, any> {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Set both in apps/admin/.env.local (never commit real values).',
    );
  }

  _client = createClient<any, any, any>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

/**
 * Anon-key client, used ONLY for the password-verification step of login
 * (Supabase Auth's `signInWithPassword` needs a client that talks to the
 * GoTrue auth API — it doesn't touch RLS-protected tables, so anon key is
 * correct and sufficient here). Never used for any data query.
 */
export function getAuthOnlySupabaseClient(): SupabaseClient<any, any, any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return createClient<any, any, any>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

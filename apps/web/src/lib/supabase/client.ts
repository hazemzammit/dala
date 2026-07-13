import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client — used in client components. RLS enforces
 * authorization; this client never uses the service-role key (Doc 01 §1.6).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

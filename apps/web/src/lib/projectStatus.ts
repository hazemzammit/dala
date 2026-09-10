import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Doc 03 §3.10.2 — a completed/archived project is read-only: historical
 * records still show, but no new dispatch assignment, attendance entry,
 * material request, site-log entry, or expense can be created against it.
 * Mobile enforces this client-side only (dispatch.tsx's `readOnly`,
 * project-roster.tsx citing the same reasoning) — there is no RLS policy
 * or trigger backing it anywhere in this schema, so it's not a real
 * security boundary on its own, just a UX guard. Added here as a
 * server-side check in each write action for the routes this integration
 * pass built, so the restriction actually holds regardless of what calls
 * the action, not only when the official UI happens to be the caller.
 *
 * Returns null if the project is writable, or a French error string if
 * not (including "not found", which covers both a bad id and one that
 * belongs to a different org — same non-committal wording used elsewhere
 * in this codebase for cross-org lookups, so as not to confirm existence).
 */
export async function checkProjectIsWritable(
  supabase: SupabaseClient,
  projectId: string,
  orgId: string,
): Promise<string | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!project) {
    return 'Chantier introuvable.';
  }
  if (project.status !== 'active') {
    return 'Ce chantier est archivé ou terminé — lecture seule.';
  }
  return null;
}

/**
 * apps/admin/src/app/api/admin/users/bulk/route.ts
 *
 * Doc 04 §4.3.4 — bulk actions, admin remediation Tier 4.3. Per the plan's
 * own guidance ("bulk suspend/unsuspend is the safest starting point
 * there"), this covers exactly those two and nothing else — no bulk
 * delete, no bulk move_org, no bulk revoke_sessions. Deliberately two
 * SEPARATE actions (suspend / unsuspend) rather than a single "toggle"
 * bulk action: a selection can be a mix of already-suspended and active
 * users, and a toggle would apply the opposite effect to each depending
 * on its current state — unpredictable for the admin clicking one button
 * over a multi-row selection. Suspend and unsuspend each apply uniformly
 * to every selected target regardless of its current state instead.
 *
 * Same reuse-not-duplicate + one-audit-row-per-target shape as
 * organizations/bulk/route.ts — see that file's header for the fuller
 * reasoning, not repeated here.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';
import { setUserSuspended } from '@/lib/users/actions';

type BulkAction = 'suspend' | 'unsuspend';
const MAX_TARGETS = 100;

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Same role tier as the single-user route's suspend/unsuspend (Doc 04
  // §4.3.4 — Support only gets reset_password, not this).
  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const action = body?.action as BulkAction | undefined;
  const targetIds = Array.isArray(body?.targetIds) ? (body.targetIds as string[]) : [];

  if (action !== 'suspend' && action !== 'unsuspend') {
    return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }
  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'Aucun utilisateur sélectionné.' }, { status: 400 });
  }
  if (targetIds.length > MAX_TARGETS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_TARGETS} utilisateurs par action groupée.` },
      { status: 400 },
    );
  }

  const supabase = getAdminSupabaseClient();
  const { data: users } = await supabase.from('profiles').select('id').in('id', targetIds);
  const validIds = new Set((users ?? []).map((u) => u.id as string));

  const results: { userId: string; ok: boolean; error?: string }[] = [];

  for (const userId of targetIds) {
    if (!validIds.has(userId)) {
      results.push({ userId, ok: false, error: 'Utilisateur introuvable.' });
      continue;
    }
    try {
      await setUserSuspended(supabase, userId, action === 'suspend');
      await logAdminAction(ctx, `user.${action}`, {
        targetTable: 'profiles',
        targetId: userId,
        metadata: { bulk: true },
      });
      results.push({ userId, ok: true });
    } catch (err) {
      results.push({
        userId,
        ok: false,
        error: err instanceof Error ? err.message : 'Erreur inconnue.',
      });
    }
  }

  const failureCount = results.filter((r) => !r.ok).length;
  return NextResponse.json({ results, failureCount });
}

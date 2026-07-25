/**
 * Doc 04 §4.3.4 — per-user admin actions. "Reset password" sends the same
 * reset email a user would trigger themselves (Doc 01 §1.3.7) — admins
 * never set a password directly, preserving the "we never see a password"
 * guarantee. "Delete" requires the admin to type the user's exact email.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

type UserAction = 'reset_password' | 'suspend' | 'unsuspend' | 'delete' | 'move_org';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action as UserAction | undefined;
  const supabase = getAdminSupabaseClient();

  const { data: user } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', params.userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: authUser } = await supabase.auth.admin.getUserById(params.userId);
  const email = authUser?.user?.email;

  switch (action) {
    case 'reset_password': {
      if (!email) return NextResponse.json({ error: 'email introuvable' }, { status: 400 });
      await supabase.auth.resetPasswordForEmail(email);
      break;
    }
    case 'suspend':
      await supabase
        .from('profiles')
        .update({ suspended_at: new Date().toISOString() })
        .eq('id', user.id);
      break;
    case 'unsuspend':
      await supabase.from('profiles').update({ suspended_at: null }).eq('id', user.id);
      break;
    case 'delete': {
      const confirmEmail = typeof body?.confirmEmail === 'string' ? body.confirmEmail : '';
      if (!email || confirmEmail !== email) {
        return NextResponse.json(
          { error: 'L\u2019email saisi ne correspond pas.' },
          { status: 400 },
        );
      }
      await supabase.auth.admin.deleteUser(params.userId);
      break;
    }
    case 'move_org': {
      const fromOrgId = typeof body?.fromOrgId === 'string' ? body.fromOrgId : null;
      const toOrgId = typeof body?.toOrgId === 'string' ? body.toOrgId : null;
      if (!fromOrgId || !toOrgId) {
        return NextResponse.json({ error: 'fromOrgId/toOrgId requis' }, { status: 400 });
      }
      await supabase
        .from('organization_members')
        .update({ org_id: toOrgId })
        .eq('org_id', fromOrgId)
        .eq('user_id', user.id);
      break;
    }
    default:
      return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }

  await logAdminAction(ctx, `user.${action}`, {
    targetTable: 'profiles',
    targetId: user.id as string,
    metadata: body,
  });

  return NextResponse.json({ ok: true });
}

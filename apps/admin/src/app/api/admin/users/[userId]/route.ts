/**
 * Doc 04 §4.3.4 — per-user admin actions. "Reset password" sends the same
 * reset email a user would trigger themselves (Doc 01 §1.3.7) — admins
 * never set a password directly, preserving the "we never see a password"
 * guarantee. "Delete" requires the admin to type the user's exact email.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getPgPool } from '@/lib/db-explorer/pg-client';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';
import { setUserSuspended } from '@/lib/users/actions';

/**
 * Admin remediation Tier 4.8 — minimal GET added for the new user-detail
 * (notes-only) page's header context. Deliberately thin (name/email/
 * suspended state only) — matches the plan's own scope cut for this
 * item; a fuller detail view (org membership, etc.) stays out of scope
 * here.
 */
export async function GET(_request: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, suspended_at')
    .eq('id', params.userId)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: authUsersPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const email = authUsersPage?.users.find((u) => u.id === profile.id)?.email ?? null;

  return NextResponse.json({ user: { ...profile, email } });
}

type UserAction =
  'reset_password' | 'suspend' | 'unsuspend' | 'delete' | 'move_org' | 'revoke_sessions';

export async function POST(request: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action as UserAction | undefined;

  // Doc 04 §4.3.4 / §4.3 intro — "Reset password" is explicitly a Support
  // action (spec: "Support ... password resets"). Every other per-user
  // action here (suspend/unsuspend/delete/move_org/revoke_sessions) is a
  // data-changing action Support doesn't get.
  const roleError = requireRole(
    ctx,
    action === 'reset_password' ? ['super_admin', 'admin', 'support'] : ['super_admin', 'admin'],
  );
  if (roleError) return roleError;

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
      // Admin remediation Tier 4.3 — now shared with the bulk route via
      // lib/users/actions.ts.
      await setUserSuspended(supabase, user.id as string, true);
      break;
    case 'unsuspend':
      await setUserSuspended(supabase, user.id as string, false);
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
    case 'revoke_sessions': {
      // Doc 04 §4.3.4 — "Revoke sessions" must invalidate every refresh
      // token for this user, forcing re-login everywhere. Checked against
      // the installed @supabase/auth-js version (2.65.0, pulled in by
      // @supabase/supabase-js ^2.45.4) before writing this:
      // GoTrueAdminApi.signOut(jwt, scope) takes a SPECIFIC SESSION'S JWT,
      // not a user id — there's no admin.signOut(userId) in this version,
      // so that's not usable here for "sign this user out everywhere
      // without one of their tokens in hand."
      // A direct delete against `auth.sessions` for that user_id is the
      // correct mechanism instead — GoTrue re-checks this table on every
      // refresh-token exchange, so removing the rows invalidates every
      // active session immediately (exactly what a single-session
      // signOut does internally, generalized to "every session"). Going
      // through the raw `pg` pool (same one Database Explorer uses,
      // lib/db-explorer/pg-client.ts) rather than the supabase-js REST
      // client — `auth` isn't in PostgREST's exposed-schema list by
      // default, so `.schema('auth')` would 404 even with the
      // service-role key; a direct Postgres connection has no such
      // schema-exposure restriction.
      try {
        await getPgPool().query('delete from auth.sessions where user_id = $1', [user.id]);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Erreur inconnue.' },
          { status: 500 },
        );
      }
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
    orgId: action === 'move_org' ? (body?.toOrgId as string | undefined) : undefined,
    metadata: body,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Doc 04 §4.3.3a — full impersonation flow, step 1: start.
 *
 * Every numbered requirement in the spec is enforced here, not just
 * described:
 *  1. Mandatory reason (>=10 chars) + separate "urgent" flag.
 *  2. Scope — the admin never gets elevated access to apps/web. Instead,
 *     `supabase.auth.admin.generateLink({ type: 'magiclink', ... })`
 *     mints a genuine Supabase Auth session FOR THE TARGET USER — opening
 *     it signs the browser tab in as that exact user, through the same
 *     auth mechanism a normal login would use, so RLS applies identically
 *     to it as to the user's own session. This is Supabase Auth's own
 *     built-in mechanism, not a custom token — there's no bespoke
 *     "impersonation JWT" for apps/web to specially recognize, which
 *     means apps/web needs zero impersonation-aware code of its own.
 *  3. Nesting forbidden — rejected server-side even if the client-side
 *     button was somehow still enabled.
 *  4. Banner is a frontend concern (components/shell/ImpersonationBanner),
 *     driven by the session's impersonating_user_id being non-null.
 *  5. Expiry — both clocks stored on admin_sessions and re-checked on
 *     every request in lib/require-admin-session.ts. Note this governs
 *     the ADMIN app's bookkeeping/banner state, not the magic-link
 *     session itself — Supabase's own magic-link expiry (default 1h,
 *     configurable in the Supabase Auth settings) is a second, independent
 *     clock on the actual apps/web session; both should be kept short.
 *  6. Owner notification — enqueued in impersonate/end/route.ts (not
 *     here — nothing to notify about until the session actually ends),
 *     into impersonation_notifications (migration 0023), consumed by
 *     the send-impersonation-notifications Edge Function.
 *  7. Audit — logged here AND tagged on every subsequent admin-app action
 *     via lib/audit-log.ts reading session.impersonating_user_id. Actions
 *     the admin takes inside the opened apps/web tab are that user's own
 *     normal audit trail (if apps/web has one) — this admin app has no
 *     visibility into or control over apps/web's internals, by design.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const HARD_CAP_MS = 2 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // §4.3.3a step 3 — nesting forbidden.
  if (ctx.session.impersonating_user_id) {
    return NextResponse.json(
      { error: 'Une session d\u2019impersonation est d\u00e9j\u00e0 active.' },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const targetUserId = typeof body?.userId === 'string' ? body.userId : '';
  const orgId = typeof body?.orgId === 'string' ? body.orgId : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const urgent = Boolean(body?.urgent);

  if (reason.length < 10) {
    return NextResponse.json(
      { error: 'Un motif d\u2019au moins 10 caract\u00e8res est requis.' },
      { status: 400 },
    );
  }
  if (!targetUserId || !orgId) {
    return NextResponse.json({ error: 'userId et orgId requis' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { data: targetUser } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', targetUserId)
    .maybeSingle();

  if (!targetUser) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: targetAuthUser } = await supabase.auth.admin.getUserById(targetUserId);
  const targetEmail = targetAuthUser?.user?.email;
  if (!targetEmail) {
    return NextResponse.json({ error: 'Utilisateur cible sans email associé.' }, { status: 400 });
  }

  const webAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: { redirectTo: webAppUrl },
  });

  if (linkError || !linkData) {
    return NextResponse.json(
      {
        error: `Impossible de générer la session cible : ${linkError?.message ?? 'erreur inconnue'}`,
      },
      { status: 500 },
    );
  }

  const now = Date.now();
  const idleExpiry = new Date(now + IDLE_TIMEOUT_MS);
  const hardExpiry = new Date(now + HARD_CAP_MS);
  const impersonationExpiresAt = idleExpiry < hardExpiry ? idleExpiry : hardExpiry;

  await supabase
    .from('admin_sessions')
    .update({
      impersonating_user_id: targetUserId,
      impersonation_org_id: orgId,
      impersonation_reason: reason,
      impersonation_started_at: new Date(now).toISOString(),
      impersonation_expires_at: impersonationExpiresAt.toISOString(),
      impersonation_urgent: urgent,
    })
    .eq('id', ctx.session.id);

  await logAdminAction(
    {
      ...ctx,
      session: {
        ...ctx.session,
        impersonating_user_id: targetUserId,
        impersonation_reason: reason,
      },
    },
    'admin.impersonate_start',
    { targetTable: 'profiles', targetId: targetUserId, orgId, metadata: { reason, urgent } },
  );

  return NextResponse.json({
    ok: true,
    impersonating: { id: targetUser.id, full_name: targetUser.full_name },
    expiresAt: impersonationExpiresAt.toISOString(),
    // Open this in a new tab — visiting it signs that tab in as the target
    // user via Supabase Auth's own magic-link verification, then redirects
    // to apps/web. The admin app tab keeps showing the impersonation
    // banner/countdown independently.
    actionLink: linkData.properties.action_link,
  });
}

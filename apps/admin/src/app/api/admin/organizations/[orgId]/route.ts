/**
 * Doc 04 §4.3.3 — single-org detail + destructive actions (suspend,
 * soft-delete, change plan). Every non-read action is audit-logged and
 * requires the confirm-by-typing-name check to have already passed
 * client-side (the client sends `confirmName`; the server re-validates it
 * server-side too — never trust a client-side-only gate for a destructive
 * action).
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET(_request: Request, { params }: { params: { orgId: string } }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data: organization, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', params.orgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!organization) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id, role, joined_at, profiles(full_name)')
    .eq('org_id', params.orgId);

  return NextResponse.json({ organization, members: members ?? [] });
}

type OrgAction = 'suspend' | 'unsuspend' | 'soft_delete' | 'change_plan';

export async function POST(request: Request, { params }: { params: { orgId: string } }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action as OrgAction | undefined;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const confirmName = typeof body?.confirmName === 'string' ? body.confirmName : '';

  // Doc 04 §4.3 intro — Support has no data/billing changes at all; every
  // org action here is a mutation, so Support is blocked outright.
  // Soft-delete is further restricted to Super Admin only ("Admin (...)
  // except (...) deleting orgs" — the one Admin-can't-do item).
  const roleError = requireRole(
    ctx,
    action === 'soft_delete' ? ['super_admin'] : ['super_admin', 'admin'],
  );
  if (roleError) return roleError;

  const supabase = getAdminSupabaseClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', params.orgId)
    .maybeSingle();

  if (!org) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const destructive: OrgAction[] = ['suspend', 'soft_delete'];
  if (destructive.includes(action as OrgAction)) {
    if (reason.length < 10) {
      return NextResponse.json(
        { error: 'Un motif d\u2019au moins 10 caract\u00e8res est requis.' },
        { status: 400 },
      );
    }
    if (confirmName !== org.name) {
      return NextResponse.json(
        { error: 'Le nom saisi ne correspond pas au nom exact de l\u2019organisation.' },
        { status: 400 },
      );
    }
  }

  switch (action) {
    case 'suspend':
      await supabase
        .from('organizations')
        .update({ suspended_at: new Date().toISOString() })
        .eq('id', org.id);
      break;
    case 'unsuspend':
      await supabase.from('organizations').update({ suspended_at: null }).eq('id', org.id);
      break;
    case 'soft_delete':
      await supabase.rpc('soft_delete_organization', { p_org_id: org.id });
      break;
    case 'change_plan': {
      const plan = typeof body?.plan === 'string' ? body.plan : null;
      if (!plan) return NextResponse.json({ error: 'plan requis' }, { status: 400 });
      await supabase.from('organizations').update({ plan }).eq('id', org.id);
      break;
    }
    default:
      return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }

  await logAdminAction(ctx, `org.${action}`, {
    targetTable: 'organizations',
    targetId: org.id as string,
    orgId: org.id as string,
    metadata: { reason: reason || undefined, plan: body?.plan },
  });

  return NextResponse.json({ ok: true });
}

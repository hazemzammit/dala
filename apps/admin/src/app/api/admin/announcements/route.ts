/**
 * Doc 06 §6.3 — Announcements authoring. The recipient-count estimate
 * (GET ?estimate=...) is what powers the spec's "preview panel shows the
 * estimated recipient count before sending, to catch an overly broad
 * targeting mistake" requirement — computed for real against `profiles`/
 * `organizations`, not a placeholder number. This route only inserts the
 * row (published_at set immediately for a non-scheduled publish); actual
 * push delivery happens out-of-band via the send-announcement-
 * notifications Edge Function (cron, migration 0030) picking up rows with
 * published_at set and delivered_at null — kept decoupled so a slow/failed
 * Expo Push call never blocks this route's response.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

type TargetType = 'all_users' | 'owners_only' | 'by_plan' | 'by_trade_type' | 'inactive_30d';

async function estimateRecipients(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  targetType: TargetType,
  targetValue: string | null,
): Promise<number> {
  switch (targetType) {
    case 'all_users': {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      return count ?? 0;
    }
    case 'owners_only': {
      const { count } = await supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'owner');
      return count ?? 0;
    }
    case 'by_plan': {
      if (!targetValue) return 0;
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .eq('plan', targetValue);
      const orgIds = (orgs ?? []).map((o) => o.id);
      if (orgIds.length === 0) return 0;
      const { count } = await supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .in('org_id', orgIds);
      return count ?? 0;
    }
    case 'by_trade_type': {
      if (!targetValue) return 0;
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .eq('trade_type', targetValue);
      const orgIds = (orgs ?? []).map((o) => o.id);
      if (orgIds.length === 0) return 0;
      const { count } = await supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .in('org_id', orgIds);
      return count ?? 0;
    }
    case 'inactive_30d': {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .lt('last_login_at', cutoff);
      return count ?? 0;
    }
    default:
      return 0;
  }
}

export async function GET(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const estimateOnly = searchParams.get('estimate');
  const supabase = getAdminSupabaseClient();

  if (estimateOnly) {
    const targetType = searchParams.get('targetType') as TargetType | null;
    const targetValue = searchParams.get('targetValue');
    if (!targetType) return NextResponse.json({ error: 'targetType requis' }, { status: 400 });
    const count = await estimateRecipients(supabase, targetType, targetValue);
    return NextResponse.json({ count });
  }

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ announcements: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Doc 04 §4.3 intro — publishing/scheduling a broadcast is a data
  // change Support doesn't get.
  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const channels = Array.isArray(body?.channels) ? body.channels : [];
  const targetType = body?.targetType as TargetType | undefined;
  const targetValue = typeof body?.targetValue === 'string' ? body.targetValue : null;
  const scheduledFor = typeof body?.scheduledFor === 'string' ? body.scheduledFor : null;

  if (!message || channels.length === 0 || !targetType) {
    return NextResponse.json(
      { error: 'message, channels et targetType sont requis' },
      { status: 400 },
    );
  }

  const supabase = getAdminSupabaseClient();
  const estimatedCount = await estimateRecipients(supabase, targetType, targetValue);

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      created_by: ctx.admin.id,
      message,
      channels,
      target_type: targetType,
      target_value: targetValue,
      scheduled_for: scheduledFor,
      // "Publier" (no scheduledFor) marks it published now; "Programmer"
      // leaves published_at null until scheduled_for is due — a real
      // cron job (migration 0031, every minute) flips published_at at
      // that point, which then feeds send-announcement-notifications
      // (0030) the same way an immediate publish already does.
      published_at: scheduledFor ? null : new Date().toISOString(),
      estimated_recipient_count: estimatedCount,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(ctx, scheduledFor ? 'announcement.schedule' : 'announcement.publish', {
    targetTable: 'announcements',
    targetId: announcement.id,
    metadata: { targetType, targetValue, estimatedCount },
  });

  return NextResponse.json({ ok: true, announcement });
}

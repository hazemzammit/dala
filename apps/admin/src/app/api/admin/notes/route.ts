/**
 * apps/admin/src/app/api/admin/notes/route.ts
 *
 * Doc 04 §4.3.3/§4.3.4 — internal notes, admin remediation Tier 4.8.
 * `GET ?targetType=org|user&targetId=<uuid>` — any authenticated admin
 * role can read (Doc 04 §4.3 intro's "Support: read-only everywhere").
 * `POST { targetType, targetId, body }` — any authenticated admin role
 * can write a note too — unlike org/user mutations, leaving internal
 * commentary isn't a data-changing action Support should be blocked
 * from; Support is exactly the role most likely to be the one on the
 * phone with a contractor and wanting to leave a note about the call.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get('targetType');
  const targetId = searchParams.get('targetId');
  if ((targetType !== 'org' && targetType !== 'user') || !targetId) {
    return NextResponse.json({ error: 'targetType et targetId requis.' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('admin_notes')
    .select(
      'id, target_type, target_id, author_admin_id, body, created_at, updated_at, platform_admins(full_name)',
    )
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notes = (data ?? []).map((n) => ({
    ...n,
    author_name: (n as any).platform_admins?.full_name ?? '—',
    platform_admins: undefined,
  }));

  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const targetType = body?.targetType;
  const targetId = body?.targetId;
  const noteBody = typeof body?.body === 'string' ? body.body.trim() : '';

  if (targetType !== 'org' && targetType !== 'user') {
    return NextResponse.json({ error: 'targetType invalide.' }, { status: 400 });
  }
  if (!targetId) return NextResponse.json({ error: 'targetId requis.' }, { status: 400 });
  if (!noteBody)
    return NextResponse.json({ error: 'Le contenu de la note est requis.' }, { status: 400 });

  const supabase = getAdminSupabaseClient();
  const { data: note, error } = await supabase
    .from('admin_notes')
    .insert({
      target_type: targetType,
      target_id: targetId,
      author_admin_id: ctx.admin.id,
      body: noteBody,
    })
    .select('id, target_type, target_id, author_admin_id, body, created_at, updated_at')
    .single();

  if (error || !note) {
    return NextResponse.json({ error: error?.message ?? 'Création impossible.' }, { status: 500 });
  }

  await logAdminAction(ctx, 'note.create', {
    targetTable: targetType === 'org' ? 'organizations' : 'profiles',
    targetId,
    orgId: targetType === 'org' ? targetId : undefined,
    metadata: { noteId: note.id },
  });

  return NextResponse.json({ ok: true, note: { ...note, author_name: ctx.admin.full_name } });
}

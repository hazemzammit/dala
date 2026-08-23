/**
 * apps/admin/src/app/api/admin/notes/[noteId]/route.ts
 *
 * Doc 04 §4.3.6, admin remediation Tier 4.8 — edit/delete restricted to
 * the note's original author or a Super Admin (checked here, in the
 * route, not just hidden in the UI — same defense-in-depth every other
 * mutating route in this app already follows). Both logged to audit_log,
 * same as every other mutating admin action.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

async function canModify(
  ctx: Awaited<ReturnType<typeof getAdminSessionContext>>,
  authorId: string,
) {
  if (!ctx) return false;
  return ctx.admin.role === 'super_admin' || ctx.admin.id === authorId;
}

export async function PATCH(request: Request, { params }: { params: { noteId: string } }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data: existing } = await supabase
    .from('admin_notes')
    .select('id, target_type, target_id, author_admin_id')
    .eq('id', params.noteId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await canModify(ctx, existing.author_admin_id as string))) {
    return NextResponse.json(
      { error: "Seuls l'auteur de la note ou un Super Admin peuvent la modifier." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const noteBody = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!noteBody)
    return NextResponse.json({ error: 'Le contenu de la note est requis.' }, { status: 400 });

  const { data: updated, error } = await supabase
    .from('admin_notes')
    .update({ body: noteBody, updated_at: new Date().toISOString() })
    .eq('id', params.noteId)
    .select('id, body, updated_at')
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? 'Mise à jour impossible.' },
      { status: 500 },
    );
  }

  await logAdminAction(ctx, 'note.update', {
    targetTable: existing.target_type === 'org' ? 'organizations' : 'profiles',
    targetId: existing.target_id as string,
    orgId: existing.target_type === 'org' ? (existing.target_id as string) : undefined,
    metadata: { noteId: existing.id },
  });

  return NextResponse.json({ ok: true, note: updated });
}

export async function DELETE(_request: Request, { params }: { params: { noteId: string } }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data: existing } = await supabase
    .from('admin_notes')
    .select('id, target_type, target_id, author_admin_id')
    .eq('id', params.noteId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await canModify(ctx, existing.author_admin_id as string))) {
    return NextResponse.json(
      { error: "Seuls l'auteur de la note ou un Super Admin peuvent la supprimer." },
      { status: 403 },
    );
  }

  await supabase.from('admin_notes').delete().eq('id', params.noteId);

  await logAdminAction(ctx, 'note.delete', {
    targetTable: existing.target_type === 'org' ? 'organizations' : 'profiles',
    targetId: existing.target_id as string,
    orgId: existing.target_type === 'org' ? (existing.target_id as string) : undefined,
    metadata: { noteId: existing.id },
  });

  return NextResponse.json({ ok: true });
}

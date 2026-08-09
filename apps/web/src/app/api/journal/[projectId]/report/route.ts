import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';

import { DailyReportDocument, type DailyReportEntry } from '@/lib/pdf/DailyReportDocument';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'Paramètre date manquant.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) {
    return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 400 });
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', profile.active_org_id)
    .single();

  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', params.projectId)
    .single();

  const { data: logs } = await supabase
    .from('site_logs')
    .select('photo_url, caption, created_at')
    .eq('project_id', params.projectId)
    .gte('created_at', date + 'T00:00:00.000Z')
    .lte('created_at', date + 'T23:59:59.999Z')
    .order('created_at', { ascending: true });

  const entries: DailyReportEntry[] = await Promise.all(
    (logs ?? []).map(async (log) => {
      let photoUrl: string | null = null;
      if (log.photo_url) {
        const { data } = await supabase.storage
          .from('site-logs')
          .createSignedUrl(log.photo_url, 3600);
        photoUrl = data?.signedUrl ?? null;
      }
      return {
        photoUrl,
        caption: log.caption,
        time: new Date(log.created_at).toLocaleTimeString('fr-TN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    }),
  );

  const dateLabel = new Intl.DateTimeFormat('fr-TN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date + 'T00:00:00'));

  const buffer = await renderToBuffer(
    DailyReportDocument({
      organizationName: organization?.name ?? '—',
      projectName: project?.name ?? '—',
      dateLabel,
      entries,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="compte-rendu-' + date + '.pdf"',
    },
  });
}

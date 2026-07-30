// supabase/functions/generate-report/index.ts
//
// Phase 5 — Doc 03 §3.20 "Reports & exports": Rapport de progression,
// Résumé de paie, Déclaration CNSS, Résumé de sécurité, each over a date
// range. SCOPE CUT at the time (see packages/validation/src/exports.ts's
// header): CSV only, no PDF/xlsx library wired in.
//
// PHASE 6 — PDF added via `pdf-lib` (pure TS, no native/canvas dependency,
// imported the same `npm:` way as @supabase/supabase-js below), but ONLY
// for `progression` and `safety_summary` — the two report types confirmed
// in scope. `payroll_summary`/`cnss_declaration` remain CSV-only; .xlsx
// remains entirely unbuilt for every report type. The Zod schema
// (packages/validation/src/exports.ts) enforces this same restriction
// before a request ever reaches here, so the 400 below is a defense-in-
// depth backstop, not the only place this is checked.
//
// ALSO IMPORTANT, stated plainly rather than left to be discovered later:
// `payroll_summary` and `cnss_declaration` are basic aggregations over
// attendance_records/advances for the contractor's own record-keeping —
// they are NOT a certified payroll calculation or an official CNSS filing
// document. Tunisian CNSS declarations have real regulatory rules (exact
// contribution rates, filing format) this pass does not attempt to
// replicate; the report gives the underlying worker-days and amounts an
// accountant would need, not a filing-ready document.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

import { corsHeaders } from '../_shared/cors.ts';

const PDF_ELIGIBLE_REPORT_TYPES = new Set(['progression', 'safety_summary']);

const REPORT_TITLES: Record<string, string> = {
  progression: 'Rapport de progression',
  payroll_summary: 'Résumé de paie',
  cnss_declaration: 'Déclaration CNSS',
  safety_summary: 'Résumé de sécurité',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Authentification requise.' }, 401);

    const { org_id, report_type, date_from, date_to, format } = await req.json();
    if (!org_id || !report_type || !date_from || !date_to) {
      return jsonResponse({ error: 'Champs requis manquants.' }, 400);
    }
    const outputFormat = format === 'pdf' ? 'pdf' : 'csv';
    if (outputFormat === 'pdf' && !PDF_ELIGIBLE_REPORT_TYPES.has(report_type)) {
      return jsonResponse(
        {
          error:
            "Le format PDF n'est disponible que pour les rapports de progression et de sécurité.",
        },
        400,
      );
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) return jsonResponse({ error: 'Session invalide.' }, 401);

    const { data: membership } = await callerClient
      .from('organization_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership)
      return jsonResponse({ error: "Vous n'êtes pas membre de cette organisation." }, 403);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // progression/safety_summary build a structured {headers, rows} table
    // once, then render to either CSV or PDF from the same data — avoids
    // fetching twice and guarantees the two formats never drift apart.
    // payroll_summary/cnss_declaration stay CSV-only, unchanged from Phase 5.
    let table: ReportTable | null = null;
    let csv: string;
    switch (report_type) {
      case 'progression':
        table = await progressionReport(admin, org_id, date_from, date_to);
        csv = tableToCSV(table);
        break;
      case 'payroll_summary':
        csv = await payrollSummaryReport(admin, org_id, date_from, date_to);
        break;
      case 'cnss_declaration':
        csv = await cnssDeclarationReport(admin, org_id, date_from, date_to);
        break;
      case 'safety_summary':
        table = await safetySummaryReport(admin, org_id, date_from, date_to);
        csv = tableToCSV(table);
        break;
      default:
        return jsonResponse({ error: 'Type de rapport inconnu.' }, 400);
    }

    if (outputFormat === 'pdf' && table) {
      const { data: org } = await admin
        .from('organizations')
        .select('name')
        .eq('id', org_id)
        .maybeSingle();
      const pdfBytes = await tableToPDF(
        REPORT_TITLES[report_type] ?? report_type,
        org?.name ?? '—',
        date_from,
        date_to,
        table,
      );
      return new Response(pdfBytes, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${report_type}-${date_from}-${date_to}.pdf"`,
        },
      });
    }

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${report_type}-${date_from}-${date_to}.csv"`,
      },
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Erreur inconnue.' }, 500);
  }
});

interface ReportTable {
  headers: string[];
  rows: string[][];
}

// deno-lint-ignore no-explicit-any
async function progressionReport(
  admin: any,
  orgId: string,
  from: string,
  to: string,
): Promise<ReportTable> {
  const { data: projects } = await admin.from('projects').select('*').eq('lead_org_id', orgId);
  const rows: string[][] = [];
  for (const project of projects ?? []) {
    const { data: expenses } = await admin
      .from('project_expenses')
      .select('amount')
      .eq('project_id', project.id)
      .gte('expense_date', from)
      .lte('expense_date', to);
    const totalExpenses = (expenses ?? []).reduce(
      (sum: number, e: { amount: number }) => sum + Number(e.amount),
      0,
    );
    const { count: workerDays } = await admin
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'present')
      .gte('record_date', from)
      .lte('record_date', to);
    rows.push([project.name, project.status, totalExpenses.toFixed(2), String(workerDays ?? 0)]);
  }
  return { headers: ['Chantier', 'Statut', 'Dépenses (TND)', 'Jours-travailleur'], rows };
}

// deno-lint-ignore no-explicit-any
async function payrollSummaryReport(admin: any, orgId: string, from: string, to: string) {
  const { data: workers } = await admin.from('active_workers').select('*').eq('org_id', orgId);
  const rows = [
    'Travailleur,Taux journalier (TND),Jours présents,Avances approuvées (TND),Solde estimé (TND)',
  ];
  for (const worker of workers ?? []) {
    const { count: presentDays } = await admin
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', worker.id)
      .eq('status', 'present')
      .gte('record_date', from)
      .lte('record_date', to);
    const { data: advances } = await admin
      .from('advances')
      .select('amount')
      .eq('worker_id', worker.id)
      .eq('status', 'approved')
      .gte('created_at', from)
      .lte('created_at', to);
    const totalAdvances = (advances ?? []).reduce(
      (sum: number, a: { amount: number }) => sum + Number(a.amount),
      0,
    );
    const dailyRate = Number(worker.daily_rate ?? 0);
    const estimatedBalance = dailyRate * (presentDays ?? 0) - totalAdvances;
    rows.push(
      `"${worker.full_name}",${dailyRate},${presentDays ?? 0},${totalAdvances},${estimatedBalance}`,
    );
  }
  return rows.join('\n');
}

// deno-lint-ignore no-explicit-any
async function cnssDeclarationReport(admin: any, orgId: string, from: string, to: string) {
  const { data: workers } = await admin.from('active_workers').select('*').eq('org_id', orgId);
  const rows = ['Travailleur,Métier,Taux journalier (TND),Jours travaillés'];
  for (const worker of workers ?? []) {
    const { count: presentDays } = await admin
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', worker.id)
      .eq('status', 'present')
      .gte('record_date', from)
      .lte('record_date', to);
    rows.push(
      `"${worker.full_name}","${worker.trade ?? ''}",${worker.daily_rate ?? 0},${presentDays ?? 0}`,
    );
  }
  return rows.join('\n');
}

// deno-lint-ignore no-explicit-any
async function safetySummaryReport(
  admin: any,
  orgId: string,
  from: string,
  to: string,
): Promise<ReportTable> {
  const { data: incidents } = await admin
    .from('safety_incidents')
    .select('*, projects(name)')
    .eq('org_id', orgId)
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false });

  const rows: string[][] = [];
  for (const incident of incidents ?? []) {
    rows.push([
      incident.created_at.slice(0, 10),
      incident.severity,
      incident.projects?.name ?? '—',
      incident.description ?? '',
    ]);
  }
  return { headers: ['Date', 'Gravité', 'Chantier', 'Description'], rows };
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function tableToCSV(table: ReportTable): string {
  const lines = [table.headers.map(csvEscape).join(',')];
  for (const row of table.rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

// Simple, single-page-flowing table renderer — no branded template system
// exists in this repo (Doc 05's design tokens are a Tamagui/RN concept,
// not portable to a Deno PDF context), so this is a clean, readable A4
// table: title, org name + date range, header row, data rows, page-break
// when a page fills up. Not attempting Doc 03 §3.20's "branded" polish
// (logo placement, brand colors) this pass — that's a real follow-up, not
// silently declared done here.
async function tableToPDF(
  title: string,
  orgName: string,
  from: string,
  to: string,
  table: ReportTable,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4 portrait, points
  const pageHeight = 841.89;
  const margin = 40;
  const rowHeight = 20;
  const colCount = table.headers.length;
  const colWidth = (pageWidth - margin * 2) / colCount;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function drawHeader() {
    page.drawText(title, { x: margin, y, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    y -= 20;
    page.drawText(`${orgName} — ${from} au ${to}`, {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 24;
    table.headers.forEach((h, i) => {
      page.drawText(h, {
        x: margin + i * colWidth,
        y,
        size: 9.5,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      });
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= rowHeight - 6;
  }

  drawHeader();

  for (const row of table.rows) {
    if (y < margin + rowHeight) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }
    row.forEach((cell, i) => {
      // Truncate long free-text cells (e.g. incident descriptions) rather
      // than overflowing into the next column — good enough for a Phase 6
      // first pass; real word-wrap is a follow-up if descriptions in
      // practice run long.
      const text = cell.length > 60 ? `${cell.slice(0, 57)}...` : cell;
      page.drawText(text, {
        x: margin + i * colWidth,
        y,
        size: 9,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
    });
    y -= rowHeight;
  }

  if (table.rows.length === 0) {
    page.drawText('Aucune donnée pour cette période.', {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return doc.save();
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// supabase/functions/generate-report/index.ts
//
// Phase 5 — Doc 03 §3.20 "Reports & exports": Rapport de progression,
// Résumé de paie, Résumé de sécurité, each over a date range (originally
// shipped with a fourth type, "Déclaration CNSS" — removed in
// improvement-plan Phase 1 §7, see below). SCOPE CUT at the time (see
// packages/validation/src/exports.ts's header): CSV only, no PDF/xlsx
// library wired in.
//
// PHASE 6 — PDF added via `pdf-lib` (pure TS, no native/canvas dependency,
// imported the same `npm:` way as @supabase/supabase-js below), but ONLY
// for `progression` and `safety_summary` — the two report types confirmed
// in scope. `payroll_summary` remained CSV-only; .xlsx remains entirely
// unbuilt for every report type. The Zod schema
// (packages/validation/src/exports.ts) enforces this same restriction
// before a request ever reaches here, so the 400 below is a defense-in-
// depth backstop, not the only place this is checked.
//
// ALSO IMPORTANT, stated plainly rather than left to be discovered later:
// `payroll_summary` is a basic aggregation over attendance_records/advances
// for the contractor's own record-keeping — it is NOT a certified payroll
// calculation. It gives the underlying worker-days and amounts an
// accountant would need, not a filing-ready document. As of Phase 5, this
// is no longer just a code comment — the PDF itself now carries a printed
// disclaimer saying the same thing (see `PAYROLL_DISCLAIMER` below), so a
// reader who only ever sees the PDF (not this file) still gets the
// warning.
//
// PHASE 13 FIX: all "jours travaillés"/"jours présents" counts below now
// read `attendance_effective` (migration 0036) instead of raw
// `attendance_records`. Before this, a worker with both a manual_pointage
// row and a dispatch_checkin row on the same day had that day counted
// TWICE in every one of these reports — including the payroll one, where
// that's a real inflated-figure bug, not a cosmetic one. See 0036's
// migration header for the full cross-codebase audit this came out of.
// export-org-data/index.ts was deliberately left reading raw
// attendance_records — a full data export should return every underlying
// row, not a resolved/collapsed one.
//
// IMPROVEMENT-PLAN PHASE 1 (§7): the `cnss_declaration` report type has
// been removed — it used no employer-level CNSS data (no such field
// exists anywhere in this schema), so labeling it a CNSS declaration was
// actively misleading rather than a real filing document. This is one of
// three touch points (see also packages/validation/src/exports.ts and
// apps/mobile/src/app/(contractor)/reports.tsx); no schema change,
// `progression`/`payroll_summary`/`safety_summary` are unaffected.
//
// IMPROVEMENT-PLAN PHASE 5 (§1.4 step 3, §1.10) — "Export completion":
//
//   1. Org LOGO now embeds top-left of every PDF page's header (not just
//      the first page — see `drawHeader()`'s own comment for why every
//      page was chosen over first-page-only). Entirely non-fatal: a
//      missing/failed logo silently falls back to the text-only header
//      that already worked, exactly as before this phase — a broken logo
//      must never break a report. The storage BUCKET NAME NEEDED
//      CORRECTING while implementing this: the plan doc's own §1.4 step 3
//      wording assumes an `org-logos` bucket, but `logo_url` (migration
//      0003, confirmed by reading `apps/mobile/src/lib/storage.ts` and
//      `organization-settings.tsx` directly before writing this) is a bare
//      path inside the single shared `org-files` bucket every other photo
//      field in this app already uses (`{orgId}/logo/{uuid}.png` —
//      `uploadOrgFile(orgId, 'logo', ...)`), not a dedicated bucket. Using
//      `org-logos` here would have failed on every real org, silently
//      (the non-fatal fallback would have masked it as "just no logo set"
//      instead of "wrong bucket name").
//
//   2. `payroll_summary` is now PDF-eligible (`PDF_ELIGIBLE_REPORT_TYPES`
//      below), with a printed disclaimer on the last page. Its CSV output
//      is BYTE-FOR-BYTE UNCHANGED from before this phase — see
//      `payrollSummaryReport()`'s own comment for why that required NOT
//      routing the CSV through the generic `tableToCSV()`/`csvEscape()`
//      pair the other two report types use.
//
//   3. Every PDF-eligible report type now gets a one-page "vue d'ensemble"
//      chart page, drawn BEFORE the data table — see `drawChartPage()` and
//      each report function's own `chart` field for what's plotted and
//      why. Built from `pdf-lib`'s own rectangle/line/text primitives —
//      there is no SVG/canvas support in this Deno context, so nothing
//      from `apps/mobile/src/components/ui/Chart.tsx` is imported or
//      reused directly (it's built on `react-native-svg`, which doesn't
//      run here) — only the DATA SHAPE that component already establishes
//      (bars = categories × amounts) is reused, recomputed from the same
//      queries these report functions already run.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

import { corsHeaders } from '../_shared/cors.ts';
import { withInvocationLog } from '../_shared/logInvocation.ts';
// PHASE 9 — fetchLogoAsset/LogoAsset/the storage bucket name moved to
// _shared/pdfBranding.ts, which generate-invoice-pdf (this phase) now
// also imports from. This file's own copies were deleted; behavior is
// byte-for-byte unchanged, only the import path moved — see that file's
// own header for why it was extracted and what deliberately stayed here
// instead (the ReportTable/ChartSpec page-drawing code, still below).
import { embedLogo, fetchLogoAsset, type LogoAsset } from '../_shared/pdfBranding.ts';

import { canGenerateReport } from '../_shared/reportAccess.ts';
// Phase 5 — payroll_summary joins the two report types that already
// supported PDF. .xlsx remains entirely unbuilt for every report type,
// unchanged from before this phase (see header above).
const PDF_ELIGIBLE_REPORT_TYPES = new Set(['progression', 'payroll_summary', 'safety_summary']);

// PHASE 9 §2.6 — 'payslip' is intentionally NOT added to
// PDF_ELIGIBLE_REPORT_TYPES above: that set (and the generic
// ReportTable/ChartSpec routing below it) is for the three curated,
// org-wide reports. A payslip is a genuinely different document shape —
// one worker, a letterhead, a Jours × Taux = Brut / − Avances = Net
// breakdown, not a data table — so it's handled as its own branch further
// down (see the `report_type === 'payslip'` short-circuit before the
// switch), with its own PDF builder (`buildPayslipPDF`). PDF-only, no CSV
// form: a payslip is meant to be handed to one worker, not tabulated —
// see packages/validation/src/exports.ts's schema for the same
// restriction enforced before a request reaches here.
const REPORT_TITLES: Record<string, string> = {
  progression: 'Rapport de progression',
  payroll_summary: 'Résumé de paie',
  safety_summary: 'Résumé de sécurité',
};

// Phase 5 (§1.10 step 1) — printed once, on the last page of a
// payroll_summary PDF only. Wording matches the plan doc's own text
// verbatim; not paraphrased, since this is a legal/liability disclaimer
// whose exact phrasing was specified deliberately.
const PAYROLL_DISCLAIMER =
  "Ce résumé est une agrégation automatique à titre indicatif. Il ne constitue pas un bulletin de salaire certifié, une déclaration fiscale ou un document légal. Toute utilisation formelle requiert la validation d'un comptable agréé.";

// PHASE 9 — the local STORAGE_BUCKET const that used to live here (see the
// Phase 5 header note above for the bucket-name correction it originally
// documented) moved with fetchLogoAsset into _shared/pdfBranding.ts as
// ORG_FILES_BUCKET; nothing in this file references the bucket name
// directly anymore, so no re-export was needed here.

// Brand teal (packages/design-tokens/src/index.ts's `accent[600]`,
// '#0F9D8E') converted to pdf-lib's 0–1 rgb() — this Deno context can't
// import the Tamagui token file directly (same reasoning `tableToPDF`'s
// original header already gives for not attempting a branded template),
// but a chart bar with no relationship at all to the app's own brand
// color would look like it belongs to a different product. One constant,
// not a token import.
const CHART_TEAL = rgb(0.059, 0.616, 0.557);
const SEVERITY_COLORS: Record<string, ReturnType<typeof rgb>> = {
  minor: rgb(0.2, 0.6, 0.35), // matches safety.tsx's $success mapping
  moderate: rgb(0.85, 0.55, 0.1), // matches safety.tsx's $warning mapping
  severe: rgb(0.8, 0.2, 0.2), // matches safety.tsx's $danger mapping
};
const SEVERITY_LABELS: Record<string, string> = {
  minor: 'Mineur',
  moderate: 'Modéré',
  severe: 'Grave',
};

Deno.serve(
  withInvocationLog('generate-report', async (req, ctx) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ error: 'Authentification requise.' }, 401);

      const { org_id, report_type, date_from, date_to, format, worker_id } = await req.json();
      if (!org_id || !report_type || !date_from || !date_to) {
        return jsonResponse({ error: 'Champs requis manquants.' }, 400);
      }
      ctx.orgId = org_id;
      const outputFormat = format === 'pdf' ? 'pdf' : 'csv';
      if (report_type === 'payslip') {
        if (outputFormat !== 'pdf') {
          return jsonResponse(
            { error: 'La fiche de paie est disponible uniquement au format PDF.' },
            400,
          );
        }
        if (!worker_id) {
          return jsonResponse({ error: 'Sélectionnez un travailleur.' }, 400);
        }
      } else if (outputFormat === 'pdf' && !PDF_ELIGIBLE_REPORT_TYPES.has(report_type)) {
        return jsonResponse(
          {
            error:
              'Le format PDF est disponible pour les rapports de progression, de paie et de sécurité.',
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

      // Viewers are money-blind (0103): pay/spend reports are owner/manager only.
      if (!canGenerateReport(membership.role, report_type)) {
        return jsonResponse(
          { error: 'Ce rapport est réservé aux propriétaires et aux gestionnaires.' },
          403,
        );
      }

      // 0044 — no reports/export on the free tier. Same callerClient (RLS-
      // scoped) used for the membership check just above, kept before the
      // service-role client below is created.
      const { data: org } = await callerClient
        .from('organizations')
        .select('subscription_status')
        .eq('id', org_id)
        .maybeSingle();
      if (org?.subscription_status === 'past_due') {
        return jsonResponse(
          { error: "La génération de rapports n'est pas disponible sur l'offre gratuite." },
          403,
        );
      }

      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      // PHASE 9 §2.6 — payslip short-circuits before the generic
      // ReportTable/ChartSpec routing below (see PDF_ELIGIBLE_REPORT_TYPES'
      // own comment above for why). worker_id membership is checked here
      // (worker.org_id === org_id, the same org the caller was already
      // confirmed a member of above) rather than trusted from the request.
      if (report_type === 'payslip') {
        const { data: worker } = await admin
          .from('workers')
          .select('*')
          .eq('id', worker_id)
          .eq('org_id', org_id)
          .maybeSingle();
        if (!worker) return jsonResponse({ error: 'Travailleur introuvable.' }, 404);

        const { data: orgRow } = await admin
          .from('organizations')
          .select('name, logo_url')
          .eq('id', org_id)
          .maybeSingle();

        const slip = await payslipData(admin, worker, date_from, date_to);
        const logoAsset = await fetchLogoAsset(admin, orgRow?.logo_url ?? null);
        const pdfBytes = await buildPayslipPDF({
          orgName: orgRow?.name ?? '—',
          from: date_from,
          to: date_to,
          logoAsset,
          ...slip,
        });
        return new Response(pdfBytes, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="fiche-paie-${worker.full_name.replace(/\s+/g, '-')}-${date_from}-${date_to}.pdf"`,
          },
        });
      }

      // progression/payroll_summary/safety_summary each build a structured
      // {headers, rows} table plus an optional chart spec once, then render
      // to CSV and/or PDF from that same data — avoids fetching twice and
      // guarantees the formats never drift apart. Exception: payroll_summary's
      // CSV string is still built by its own dedicated function, not
      // `tableToCSV()` — see that function's own comment for why.
      let table: ReportTable | null = null;
      let chart: ChartSpec | null = null;
      let csv: string;
      switch (report_type) {
        case 'progression': {
          const result = await progressionReport(admin, org_id, date_from, date_to);
          table = result.table;
          chart = result.chart;
          csv = tableToCSV(table);
          break;
        }
        case 'payroll_summary': {
          const result = await payrollSummaryReport(admin, org_id, date_from, date_to);
          table = result.table;
          chart = result.chart;
          csv = result.csv;
          break;
        }
        case 'safety_summary': {
          const result = await safetySummaryReport(admin, org_id, date_from, date_to);
          table = result.table;
          chart = result.chart;
          csv = tableToCSV(table);
          break;
        }
        default:
          return jsonResponse({ error: 'Type de rapport inconnu.' }, 400);
      }

      if (outputFormat === 'pdf' && table) {
        const { data: orgRow } = await admin
          .from('organizations')
          .select('name, logo_url')
          .eq('id', org_id)
          .maybeSingle();

        const logoAsset = await fetchLogoAsset(admin, orgRow?.logo_url ?? null);

        const pdfBytes = await buildReportPDF({
          title: REPORT_TITLES[report_type] ?? report_type,
          orgName: orgRow?.name ?? '—',
          from: date_from,
          to: date_to,
          table,
          chart,
          logoAsset,
          disclaimer: report_type === 'payroll_summary' ? PAYROLL_DISCLAIMER : null,
        });
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
  }),
);

interface ReportTable {
  headers: string[];
  rows: string[][];
}

// One shared chart shape covering every Phase 5 chart, rather than a
// separate type per report — all three reduce to either a single row of
// horizontal bars (progression's per-project spend, payroll's per-worker
// present-days) or a small set of vertical bar clusters (safety's
// severity counts, optionally grouped by month). Kept as a discriminated
// union so `drawChartPage()` has exactly two rendering branches, not
// three near-duplicate ones.
type ChartSpec = HorizontalBarChart | GroupedVerticalBarChart;

interface HorizontalBarChart {
  kind: 'horizontal-bars';
  pageTitle: string;
  bars: {
    label: string;
    value: number;
    displayValue: string;
    /** Progression only — draws a marker tick at this value's position
     * along the same value-relative bar, representing `budget_total`. */
    markerValue?: number | null;
  }[];
  markerLegendLabel?: string;
}

interface GroupedVerticalBarChart {
  kind: 'grouped-vertical-bars';
  pageTitle: string;
  buckets: {
    label: string;
    values: { seriesKey: string; value: number }[];
  }[];
  legend: { seriesKey: string; label: string }[];
}

// deno-lint-ignore no-explicit-any
async function progressionReport(
  admin: any,
  orgId: string,
  from: string,
  to: string,
): Promise<{ table: ReportTable; chart: ChartSpec | null }> {
  const { data: projects } = await admin.from('projects').select('*').eq('lead_org_id', orgId);
  const rows: string[][] = [];
  const bars: HorizontalBarChart['bars'] = [];
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
      .from('attendance_effective')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'present')
      .gte('record_date', from)
      .lte('record_date', to);
    rows.push([project.name, project.status, totalExpenses.toFixed(2), String(workerDays ?? 0)]);
    bars.push({
      label: project.name,
      value: totalExpenses,
      displayValue: `${totalExpenses.toFixed(0)} TND`,
      markerValue: project.budget_total != null ? Number(project.budget_total) : null,
    });
  }
  const table: ReportTable = {
    headers: ['Chantier', 'Statut', 'Dépenses (TND)', 'Jours-travailleur'],
    rows,
  };
  // Sort chart bars by spend descending so the biggest project reads
  // first — the table itself stays in the projects' natural (query) order,
  // since re-sorting the DATA TABLE would be a behavior change beyond
  // this phase's scope; only the chart's own bar order is new.
  bars.sort((a, b) => b.value - a.value);
  const chart: ChartSpec | null =
    bars.length > 0
      ? {
          kind: 'horizontal-bars',
          pageTitle: 'Vue d\u2019ensemble — Dépenses par chantier',
          bars,
          markerLegendLabel: 'Repère : budget total (si défini)',
        }
      : null;
  return { table, chart };
}

// Phase 5 — payroll_summary is now PDF-eligible, which means it needs a
// {headers, rows} ReportTable (for the PDF's data-table page) in addition
// to its pre-existing CSV string. The two are built from the SAME
// per-worker computation (one query pass, not two), but are serialized
// DIFFERENTLY on purpose:
//
//   - The CSV string below is built EXACTLY the way it always was —
//     copy-identical string interpolation, unconditionally wrapping
//     `full_name` in quotes — because the generic `tableToCSV()` /
//     `csvEscape()` pair the other two report types use only quotes a
//     cell CONDITIONALLY (when it contains a comma/quote/newline). Routing
//     payroll's CSV through that generic pair would have silently changed
//     every existing payroll CSV's byte content for any worker name with
//     no special characters (unquoted instead of always-quoted) — exactly
//     the kind of invisible regression the calling instructions warned
//     about ("if there's any difference, it's a bug in the refactor").
//     Keeping this dedicated serializer is the fix, not a workaround.
//   - The ReportTable's row cells are plain, UNQUOTED strings — correct
//     for the PDF path, which draws text directly and has no CSV-quoting
//     concept at all.
// deno-lint-ignore no-explicit-any
async function payrollSummaryReport(
  admin: any,
  orgId: string,
  from: string,
  to: string,
): Promise<{ table: ReportTable; csv: string; chart: ChartSpec | null }> {
  const { data: workers } = await admin.from('active_workers').select('*').eq('org_id', orgId);
  const csvLines = [
    'Travailleur,Taux journalier (TND),Jours présents,Avances approuvées (TND),Solde estimé (TND)',
  ];
  const tableRows: string[][] = [];
  const bars: HorizontalBarChart['bars'] = [];

  for (const worker of workers ?? []) {
    const { count: presentDays } = await admin
      .from('attendance_effective')
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
    const days = presentDays ?? 0;
    const estimatedBalance = dailyRate * days - totalAdvances;

    // Unchanged, byte-for-byte — see this function's own header comment.
    csvLines.push(
      `"${worker.full_name}",${dailyRate},${days},${totalAdvances},${estimatedBalance}`,
    );

    tableRows.push([
      worker.full_name,
      dailyRate.toFixed(2),
      String(days),
      totalAdvances.toFixed(2),
      estimatedBalance.toFixed(2),
    ]);

    bars.push({
      label: worker.full_name,
      value: days,
      displayValue: `${days} j`,
    });
  }

  bars.sort((a, b) => b.value - a.value);
  const chart: ChartSpec | null =
    bars.length > 0
      ? {
          kind: 'horizontal-bars',
          pageTitle: 'Vue d\u2019ensemble — Jours présents par travailleur',
          bars,
        }
      : null;

  return {
    table: {
      headers: [
        'Travailleur',
        'Taux journalier (TND)',
        'Jours présents',
        'Avances approuvées (TND)',
        'Solde estimé (TND)',
      ],
      rows: tableRows,
    },
    csv: csvLines.join('\n'),
    chart,
  };
}

// PHASE 9 §2.6 — payslip aggregation, deliberately reusing the EXACT same
// per-worker computation payrollSummaryReport's loop body already does
// (dailyRate * days - totalAdvances over attendance_effective/advances),
// just scoped to one worker instead of every active worker in the org.
// Confirmed via this phase's own Step 1 read of payrollSummaryReport
// before writing this: the aggregation itself was never the gap — a
// payslip-shaped PDF layout was. Returns the raw numbers; buildPayslipPDF
// (below) owns rendering.
// deno-lint-ignore no-explicit-any
async function payslipData(
  admin: any,
  worker: { id: string; full_name: string; trade: string | null; daily_rate: number | null },
  from: string,
  to: string,
): Promise<{
  workerName: string;
  trade: string | null;
  dailyRate: number;
  daysPresent: number;
  totalAdvances: number;
  grossAmount: number;
  netAmount: number;
}> {
  const { count: presentDays } = await admin
    .from('attendance_effective')
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
  const days = presentDays ?? 0;
  const grossAmount = dailyRate * days;
  const netAmount = grossAmount - totalAdvances;

  return {
    workerName: worker.full_name,
    trade: worker.trade,
    dailyRate,
    daysPresent: days,
    totalAdvances,
    grossAmount,
    netAmount,
  };
}

interface BuildPayslipPDFOptions {
  orgName: string;
  from: string;
  to: string;
  logoAsset: LogoAsset | null;
  workerName: string;
  trade: string | null;
  dailyRate: number;
  daysPresent: number;
  totalAdvances: number;
  grossAmount: number;
  netAmount: number;
}

// PHASE 9 §2.6 — a genuinely different layout from buildReportPDF's
// title-block-over-a-data-table shape (see PDF_ELIGIBLE_REPORT_TYPES'
// comment above for why this wasn't folded into that function): a
// letterhead, the worker's identity/period, then a small breakdown block
// that reads like an actual pay stub (Jours × Taux = Brut, − Avances =
// Net à payer) rather than one row of a multi-worker table. Still carries
// PAYROLL_DISCLAIMER — this remains a basic aggregation, not a certified
// bulletin de salaire, exactly as payrollSummaryReport's own header
// states; a payslip-shaped layout doesn't change what the underlying
// numbers are.
async function buildPayslipPDF(opts: BuildPayslipPDFOptions): Promise<Uint8Array> {
  const {
    orgName,
    from,
    to,
    logoAsset,
    workerName,
    trade,
    dailyRate,
    daysPresent,
    totalAdvances,
    grossAmount,
    netAmount,
  } = opts;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const obliqueFont = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logo = await embedLogo(doc, logoAsset, LOGO_BOX);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const titleX = MARGIN + (logo ? logo.width + LOGO_GAP : 0);

  if (logo) {
    // deno-lint-ignore no-explicit-any
    page.drawImage(logo.image as any, {
      x: MARGIN,
      y: y - logo.height + 4,
      width: logo.width,
      height: logo.height,
    });
  }
  page.drawText('Fiche de paie', {
    x: titleX,
    y,
    size: 18,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 22;
  page.drawText(orgName, { x: titleX, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 40;

  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 12;

  page.drawText('Travailleur', { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(workerName, {
    x: MARGIN + 120,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 18;
  if (trade) {
    page.drawText('Métier', { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText(trade, { x: MARGIN + 120, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
  }
  page.drawText('Période', { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(`${from} au ${to}`, {
    x: MARGIN + 120,
    y,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 36;

  page.drawText('Détail', { x: MARGIN, y, size: 12, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;

  function drawLine(label: string, value: string, opts?: { bold?: boolean; negative?: boolean }) {
    page.drawText(label, {
      x: MARGIN,
      y,
      size: 10,
      font: opts?.bold ? boldFont : font,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(value, {
      x: PAGE_WIDTH - MARGIN - 100,
      y,
      size: 10,
      font: opts?.bold ? boldFont : font,
      color: opts?.negative ? rgb(0.7, 0.2, 0.2) : rgb(0.2, 0.2, 0.2),
    });
    y -= 20;
  }

  drawLine('Jours travaillés', `${daysPresent} j`);
  drawLine('Taux journalier', `${dailyRate.toFixed(2)} TND`);
  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 4;
  drawLine('Montant brut', `${grossAmount.toFixed(2)} TND`, { bold: true });
  drawLine('Avances déduites', `- ${totalAdvances.toFixed(2)} TND`, { negative: true });
  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 8 },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 4;
  drawLine('Net à payer', `${netAmount.toFixed(2)} TND`, { bold: true });

  y -= 30;
  for (const line of wrapText(PAYROLL_DISCLAIMER, 100)) {
    page.drawText(line, { x: MARGIN, y, size: 8, font: obliqueFont, color: rgb(0.5, 0.5, 0.5) });
    y -= 11;
  }

  return doc.save();
}

// deno-lint-ignore no-explicit-any
async function safetySummaryReport(
  admin: any,
  orgId: string,
  from: string,
  to: string,
): Promise<{ table: ReportTable; chart: ChartSpec | null }> {
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
  const table: ReportTable = {
    headers: ['Date', 'Gravité', 'Chantier', 'Description'],
    rows,
  };

  const chart = buildSafetyChart(incidents ?? [], from, to);
  return { table, chart };
}

// Split out from safetySummaryReport() for testability/readability — pure
// function over the same `incidents` rows the table already fetched, no
// second query. Grouped by month when the range spans more than 60 days
// (plan's own threshold), otherwise a single "Total" bucket — either way
// the same GroupedVerticalBarChart shape, so drawChartPage() has one
// branch to handle regardless of which grouping was chosen.
function buildSafetyChart(
  // deno-lint-ignore no-explicit-any
  incidents: any[],
  from: string,
  to: string,
): ChartSpec | null {
  if (incidents.length === 0) return null;

  const spanDays = Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000),
  );
  const groupByMonth = spanDays > 60;

  const bucketMap = new Map<string, { minor: number; moderate: number; severe: number }>();
  for (const incident of incidents) {
    const key = groupByMonth ? String(incident.created_at).slice(0, 7) : 'total'; // "YYYY-MM" or single bucket
    const bucket = bucketMap.get(key) ?? { minor: 0, moderate: 0, severe: 0 };
    if (
      incident.severity === 'minor' ||
      incident.severity === 'moderate' ||
      incident.severity === 'severe'
    ) {
      bucket[incident.severity as 'minor' | 'moderate' | 'severe'] += 1;
    }
    bucketMap.set(key, bucket);
  }

  const keys = Array.from(bucketMap.keys()).sort();
  const buckets = keys.map((key) => {
    const counts = bucketMap.get(key)!;
    return {
      label: groupByMonth ? formatMonthLabel(key) : 'Total',
      values: [
        { seriesKey: 'minor', value: counts.minor },
        { seriesKey: 'moderate', value: counts.moderate },
        { seriesKey: 'severe', value: counts.severe },
      ],
    };
  });

  return {
    kind: 'grouped-vertical-bars',
    pageTitle: groupByMonth
      ? 'Vue d\u2019ensemble — Incidents par mois et par gravité'
      : 'Vue d\u2019ensemble — Incidents par gravité',
    buckets,
    legend: [
      { seriesKey: 'minor', label: SEVERITY_LABELS.minor! },
      { seriesKey: 'moderate', label: SEVERITY_LABELS.moderate! },
      { seriesKey: 'severe', label: SEVERITY_LABELS.severe! },
    ],
  };
}

function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('fr-TN', { month: 'short', year: '2-digit' });
}

// See export-org-data/index.ts's escapeCsvValue for why: a report row
// (project names, expense descriptions, ...) whose first character is one of
// these opens as a live formula in Excel/Sheets, not as text — CSV/"formula"
// injection (CWE-1236). Same OWASP mitigation, same character set.
const FORMULA_LEADING_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function csvEscape(value: string): string {
  const safe = value.length > 0 && FORMULA_LEADING_CHARS.has(value[0]!) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function tableToCSV(table: ReportTable): string {
  const lines = [table.headers.map(csvEscape).join(',')];
  for (const row of table.rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

// -----------------------------------------------------------------------
// Logo asset fetching — PHASE 9: fetchLogoAsset/LogoAsset now live in
// _shared/pdfBranding.ts (imported above), entirely non-fatal at every
// step exactly as before (§1.4 step 3's own instruction: "A broken logo
// must never break a report"). See this file's top-of-file import comment
// for why this moved and what deliberately stayed here.
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// PDF rendering — title/chart page(s) + table page(s), in that order
// (§1.10 step 2: "drawn BEFORE the data table, not after").
// -----------------------------------------------------------------------
const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const ROW_HEIGHT = 20;
const LOGO_BOX = 40; // pt — fixed bounding box, aspect-ratio preserved within it
const LOGO_GAP = 10;

interface BuildReportPDFOptions {
  title: string;
  orgName: string;
  from: string;
  to: string;
  table: ReportTable;
  chart: ChartSpec | null;
  logoAsset: LogoAsset | null;
  disclaimer: string | null;
}

async function buildReportPDF(opts: BuildReportPDFOptions): Promise<Uint8Array> {
  const { title, orgName, from, to, table, chart, logoAsset, disclaimer } = opts;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  // Phase 5 — no italic font existed in this file before the payroll
  // disclaimer needed one; pdf-lib's StandardFonts has no true "italic",
  // only "Oblique" (a slanted Helvetica), which is what every PDF viewer
  // renders for "italic Helvetica" anyway.
  const obliqueFont = await doc.embedFont(StandardFonts.HelveticaOblique);

  // PHASE 9 — embedding itself (fit within a LOGO_BOX × LOGO_BOX bounding
  // box, aspect ratio preserved, non-fatal on any failure) moved into
  // _shared/pdfBranding.ts's embedLogo(), shared with generate-invoice-pdf
  // (this phase). Still called HERE, not inside fetchLogoAsset — a
  // PDFImage is bound to the PDFDocument instance that embedded it, and
  // this is the only place that instance (`doc`) exists.
  const logo = await embedLogo(doc, logoAsset, LOGO_BOX);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Shared header block (logo + title + org/date-range line) — used by
  // BOTH the chart page and every table page, so the document reads as
  // one consistent design rather than two different layouts stitched
  // together. Returns the y position immediately below the header.
  function drawTitleBlock(pageTitle: string): number {
    let localY = y;
    const titleX = MARGIN + (logo ? logo.width + LOGO_GAP : 0);
    if (logo) {
      // Phase 5 judgment call, disclosed: logo renders on EVERY page's
      // header, not just the first. The plan explicitly left this as an
      // open choice ("make a deliberate choice and document it"). Chosen
      // because these reports are meant to be printed/shared as
      // standalone pages (§1.10's own "one/two-page executive summary"
      // framing) — a page handed to someone without the rest of the
      // document should still be identifiable as belonging to this org,
      // the same reason a letterhead repeats on every page of a letter.
      // deno-lint-ignore no-explicit-any
      page.drawImage(logo.image as any, {
        x: MARGIN,
        y: localY - logo.height + 4,
        width: logo.width,
        height: logo.height,
      });
    }
    page.drawText(pageTitle, {
      x: titleX,
      y: localY,
      size: 16,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    localY -= 20;
    page.drawText(`${orgName} — ${from} au ${to}`, {
      x: titleX,
      y: localY,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    localY -= 24;
    return localY;
  }

  // ---- Chart page(s), drawn first -----------------------------------
  if (chart) {
    y = drawTitleBlock(chart.pageTitle);
    if (chart.kind === 'horizontal-bars') {
      drawHorizontalBarChart(page, y, chart, font, boldFont);
    } else {
      drawGroupedVerticalBarChart(page, y, chart, font, boldFont);
    }
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  // ---- Table page(s) --------------------------------------------------
  const colCount = table.headers.length;
  const colWidth = (PAGE_WIDTH - MARGIN * 2) / colCount;

  function drawTableHeader() {
    y = drawTitleBlock(title);
    table.headers.forEach((h, i) => {
      page.drawText(h, {
        x: MARGIN + i * colWidth,
        y,
        size: 9.5,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      });
    });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= ROW_HEIGHT - 6;
  }

  drawTableHeader();

  for (const row of table.rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawTableHeader();
    }
    row.forEach((cell, i) => {
      // Truncate long free-text cells (e.g. incident descriptions) rather
      // than overflowing into the next column — good enough for a first
      // pass; real word-wrap is a follow-up if descriptions in practice
      // run long.
      const text = cell.length > 60 ? `${cell.slice(0, 57)}...` : cell;
      page.drawText(text, {
        x: MARGIN + i * colWidth,
        y,
        size: 9,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
    });
    y -= ROW_HEIGHT;
  }

  if (table.rows.length === 0) {
    page.drawText('Aucune donnée pour cette période.', {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= ROW_HEIGHT;
  }

  // ---- Payroll disclaimer, last page only -----------------------------
  // Phase 5 (§1.10 step 1) — "must appear on the last page of the report,
  // not on every page." Rendered directly below the last data row rather
  // than on its own dedicated page: it's two lines of small print, and a
  // reader has just finished looking at the table it qualifies — putting
  // it one page later would separate the caveat from the data it
  // caveats. If there isn't enough room left on the current page, a fresh
  // page is started (with the same header, for visual consistency with
  // every other page) rather than letting it overflow past the margin.
  if (disclaimer) {
    const disclaimerHeight = 34; // two wrapped lines + top gap, generous
    if (y < MARGIN + disclaimerHeight) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawTableHeader();
    }
    y -= 14;
    for (const line of wrapText(disclaimer, 100)) {
      page.drawText(line, { x: MARGIN, y, size: 8, font: obliqueFont, color: rgb(0.5, 0.5, 0.5) });
      y -= 11;
    }
  }

  return doc.save();
}

// Naive word-wrap by character count — good enough for one fixed-wording
// disclaimer at a known font size/margin; not a general-purpose text
// layout routine (the table cell truncation above stays untouched/simple
// for the same reason).
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---- Chart primitives -------------------------------------------------
// deno-lint-ignore no-explicit-any
function drawHorizontalBarChart(
  page: any,
  startY: number,
  chart: HorizontalBarChart,
  font: any,
  boldFont: any,
): void {
  const labelColWidth = 160;
  const valueColWidth = 70;
  const barAreaX = MARGIN + labelColWidth;
  const barAreaWidth = PAGE_WIDTH - MARGIN * 2 - labelColWidth - valueColWidth;
  const barHeight = 12;
  const rowGap = 10;

  if (chart.bars.length === 0) {
    page.drawText('Aucune donnée pour cette période.', {
      x: MARGIN,
      y: startY,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    return;
  }

  const max = Math.max(...chart.bars.map((b) => Math.max(b.value, b.markerValue ?? 0)), 1);
  let y = startY - 10;

  for (const bar of chart.bars) {
    const label = bar.label.length > 26 ? `${bar.label.slice(0, 23)}...` : bar.label;
    page.drawText(label, { x: MARGIN, y, size: 9.5, font, color: rgb(0.15, 0.15, 0.15) });

    const w = Math.max((bar.value / max) * barAreaWidth, bar.value > 0 ? 2 : 0);
    page.drawRectangle({
      x: barAreaX,
      y: y - (barHeight - 9),
      width: w,
      height: barHeight,
      color: CHART_TEAL,
    });

    if (bar.markerValue != null && bar.markerValue > 0) {
      const markerX = barAreaX + Math.min((bar.markerValue / max) * barAreaWidth, barAreaWidth);
      page.drawLine({
        start: { x: markerX, y: y - (barHeight - 9) - 2 },
        end: { x: markerX, y: y - (barHeight - 9) + barHeight + 2 },
        thickness: 1.5,
        color: rgb(0.6, 0.15, 0.15),
      });
    }

    page.drawText(bar.displayValue, {
      x: barAreaX + barAreaWidth + 8,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    y -= barHeight + rowGap;
    // Stop drawing once the chart page would run past the bottom margin —
    // a chart with an unusually large number of bars (many projects/
    // workers) degrades to "first N, in sorted order" rather than
    // overflowing onto a second page; the plan scoped this as a "one/
    // two-page executive summary," not a paginated chart.
    if (y < MARGIN + barHeight) break;
  }

  if (chart.markerLegendLabel) {
    page.drawText(chart.markerLegendLabel, {
      x: MARGIN,
      y: Math.max(y - 6, MARGIN),
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

// deno-lint-ignore no-explicit-any
function drawGroupedVerticalBarChart(
  page: any,
  startY: number,
  chart: GroupedVerticalBarChart,
  font: any,
  boldFont: any,
): void {
  if (
    chart.buckets.length === 0 ||
    chart.buckets.every((b) => b.values.every((v) => v.value === 0))
  ) {
    page.drawText('Aucune donnée pour cette période.', {
      x: MARGIN,
      y: startY,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    return;
  }

  const chartAreaWidth = PAGE_WIDTH - MARGIN * 2;
  const chartHeight = 220;
  const baseline = startY - chartHeight - 14; // leave room for value labels above bars
  const max = Math.max(...chart.buckets.flatMap((b) => b.values.map((v) => v.value)), 1);

  const bucketWidth = chartAreaWidth / chart.buckets.length;
  const seriesCount = chart.legend.length;
  const barGap = 3;

  chart.buckets.forEach((bucket, bi) => {
    const barsAreaWidth = bucketWidth - 16;
    const barWidth = Math.max((barsAreaWidth - barGap * (seriesCount - 1)) / seriesCount, 4);
    bucket.values.forEach((v, si) => {
      const barHeight = (v.value / max) * chartHeight;
      const bx = MARGIN + bi * bucketWidth + 8 + si * (barWidth + barGap);
      const color = SEVERITY_COLORS[v.seriesKey] ?? rgb(0.5, 0.5, 0.5);
      page.drawRectangle({ x: bx, y: baseline, width: barWidth, height: barHeight, color });
      if (v.value > 0) {
        page.drawText(String(v.value), {
          x: bx,
          y: baseline + barHeight + 3,
          size: 7.5,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }
    });
    page.drawText(bucket.label, {
      x: MARGIN + bi * bucketWidth,
      y: baseline - 14,
      size: 8.5,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  // Legend, below the x-axis labels.
  let legendX = MARGIN;
  const legendY = baseline - 32;
  for (const entry of chart.legend) {
    const color = SEVERITY_COLORS[entry.seriesKey] ?? rgb(0.5, 0.5, 0.5);
    page.drawRectangle({ x: legendX, y: legendY, width: 8, height: 8, color });
    page.drawText(entry.label, {
      x: legendX + 12,
      y: legendY,
      size: 8.5,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    legendX += 12 + entry.label.length * 4.5 + 18;
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

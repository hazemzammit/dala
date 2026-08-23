import { z } from 'zod';

/**
 * packages/validation/src/exports.ts
 *
 * Phase 5 — two DISTINCT features, confirmed against Doc 03 before writing
 * this (§3.20 "Reports & exports" vs. the self-service data export the
 * roadmap calls out separately in Doc 02 §2.10, which has no Doc 01 section
 * of its own — see the delivery guide's naming-collision check, same kind
 * Phase 4 ran for budget_shared/budget_rollup_opt_in):
 *
 *   - `generateReportSchema` — Doc 03 §3.20's curated, named reports
 *     (Rapport de progression, Résumé de paie, Résumé de sécurité), each
 *     scoped to a date range. Doc 03 §3.20 asks for PDF/Excel — Phase 5
 *     shipped CSV only (SCOPE CUT, stated at the time). PHASE 6: PDF added
 *     via `pdf-lib` (npm, pure TS, no native/canvas dependency —
 *     Deno-compatible via an `npm:` specifier, same import style already
 *     used for `@supabase/supabase-js` in this Edge Function), but ONLY for
 *     `progression` and `safety_summary` — the two report types explicitly
 *     confirmed in scope this phase. `format` is therefore still validated
 *     per report_type below, not just widened to "csv | pdf"
 *     unconditionally: `payroll_summary` stays CSV-only, since PDF was
 *     never asked for on it and adding it silently would be scope creep
 *     beyond what was confirmed. .xlsx generation remains unbuilt — no
 *     exceljs-equivalent added.
 *
 *     IMPROVEMENT-PLAN PHASE 1 (§7): the `cnss_declaration` report type —
 *     a per-worker attendance report mislabeled as a CNSS filing, using no
 *     employer-level CNSS data because no such field exists anywhere in
 *     this schema — has been removed from the enum below. This is one of
 *     three touch points (see also `supabase/functions/generate-report/
 *     index.ts` and `apps/mobile/src/app/(contractor)/reports.tsx`); no
 *     schema change, `payroll_summary`/`progression`/`safety_summary` are
 *     unaffected.
 *
 *     IMPROVEMENT-PLAN PHASE 5 (§1.10 step 1): `payroll_summary` joins
 *     `progression`/`safety_summary` as PDF-eligible — logo branding
 *     (§1.4 step 3) landed first in this same phase, satisfying the
 *     "once logo branding is in place" precondition the plan's own §1.10
 *     wording states. Its PDF carries a printed disclaimer (see
 *     `generate-report/index.ts`'s `PAYROLL_DISCLAIMER`) since it remains
 *     a basic aggregation, not a certified filing — PDF-eligible now means
 *     "has a disclaimer," not "became a legal document." `.xlsx` is still
 *     entirely unbuilt for every report type (see above).
 *   - `requestDataExportSchema` — a full raw dump of the org's own data,
 *     proposed scope (Doc 01 §1.16 doesn't exist yet to specify this) —
 *     CSV/JSON of the org's own tables, not a curated report.
 *
 * PHASE 9 (§2.6, "Timesheets -> payroll bridge"): added `payslip` to
 * `reportType` — a per-worker fiche de paie, PDF-only, requiring a new
 * `worker_id` field on the schema. Reuses `payrollSummaryReport`'s own
 * per-worker aggregation (see `generate-report/index.ts`'s `payslipData()`
 * for the Step 1 finding this is based on: the aggregation was never the
 * gap, a dedicated PDF layout was), rendered through a new dedicated
 * `buildPayslipPDF()`, not the generic ReportTable/PDF_ELIGIBLE_REPORT_TYPES
 * path the other three types share.
 *
 * Both are named org-scoped Edge Function requests, not client-side file
 * generation — reports may include cross-project totals a mobile client
 * shouldn't have to assemble itself, and a data export should run under
 * service role so it isn't limited by what a single RLS-scoped read can
 * join together efficiently.
 */

export const reportType = z.enum([
  'progression', // Rapport de progression
  'payroll_summary', // Résumé de paie
  'safety_summary', // Résumé de sécurité
  'payslip', // PHASE 9 §2.6 — per-worker fiche de paie, PDF-only (see below)
]);
export type ReportType = z.infer<typeof reportType>;

// PDF is now meaningful for all three curated report types (Phase 5 added
// payroll_summary — see file header) — .xlsx remains entirely unbuilt for
// every report type. 'payslip' is deliberately NOT in this list: it isn't
// "PDF-eligible" alongside CSV, it's PDF-ONLY (see the refine() below) —
// a payslip is meant to be handed to one worker, not tabulated as a CSV
// row the way the other three report types can be.
const PDF_ELIGIBLE_REPORT_TYPES: ReadonlyArray<z.infer<typeof reportType>> = [
  'progression',
  'payroll_summary',
  'safety_summary',
];

export const generateReportSchema = z
  .object({
    org_id: z.string().uuid(),
    report_type: reportType,
    date_from: z.string(), // date, YYYY-MM-DD
    date_to: z.string(),
    format: z.enum(['csv', 'pdf']),
    // PHASE 9 §2.6 — required (and only meaningful) when report_type is
    // 'payslip'; the report-level refine()s below enforce both directions
    // rather than leaving worker_id optional-and-ignored for the other
    // three types, which would let a client silently pass it for
    // progression/payroll_summary/safety_summary without ever finding out
    // it does nothing there.
    worker_id: z.string().uuid().optional(),
  })
  .refine(
    (input) =>
      input.report_type === 'payslip'
        ? input.format === 'pdf'
        : input.format === 'csv' || PDF_ELIGIBLE_REPORT_TYPES.includes(input.report_type),
    {
      message:
        'Le format PDF est disponible pour les rapports de progression, de paie et de sécurité. La fiche de paie est disponible uniquement au format PDF.',
      path: ['format'],
    },
  )
  .refine((input) => input.report_type !== 'payslip' || !!input.worker_id, {
    message: 'Sélectionnez un travailleur pour générer une fiche de paie.',
    path: ['worker_id'],
  });
export type GenerateReportInput = z.infer<typeof generateReportSchema>;

export const requestDataExportSchema = z.object({
  org_id: z.string().uuid(),
  format: z.enum(['csv', 'json']),
});
export type RequestDataExportInput = z.infer<typeof requestDataExportSchema>;

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
 *     (Rapport de progression, Résumé de paie, Déclaration CNSS, Résumé de
 *     sécurité), each scoped to a date range. Doc 03 §3.20 asks for PDF/
 *     Excel — Phase 5 shipped CSV only (SCOPE CUT, stated at the time).
 *     PHASE 6: PDF added via `pdf-lib` (npm, pure TS, no native/canvas
 *     dependency — Deno-compatible via an `npm:` specifier, same import
 *     style already used for `@supabase/supabase-js` in this Edge
 *     Function), but ONLY for `progression` and `safety_summary` — the two
 *     report types explicitly confirmed in scope this phase. `format` is
 *     therefore still validated per report_type below, not just widened to
 *     "csv | pdf" unconditionally: `payroll_summary`/`cnss_declaration`
 *     stay CSV-only, since PDF was never asked for on those two and adding
 *     it silently would be scope creep beyond what was confirmed.
 *     .xlsx generation remains unbuilt — no exceljs-equivalent added.
 *   - `requestDataExportSchema` — a full raw dump of the org's own data,
 *     proposed scope (Doc 01 §1.16 doesn't exist yet to specify this) —
 *     CSV/JSON of the org's own tables, not a curated report.
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
  'cnss_declaration', // Déclaration CNSS
  'safety_summary', // Résumé de sécurité
]);
export type ReportType = z.infer<typeof reportType>;

// PDF is only meaningful for the two report types confirmed in scope this
// phase (Phase 6) — payroll_summary/cnss_declaration stay CSV-only, and
// .xlsx remains entirely unbuilt for every report type (see file header).
const PDF_ELIGIBLE_REPORT_TYPES: ReadonlyArray<z.infer<typeof reportType>> = [
  'progression',
  'safety_summary',
];

export const generateReportSchema = z
  .object({
    org_id: z.string().uuid(),
    report_type: reportType,
    date_from: z.string(), // date, YYYY-MM-DD
    date_to: z.string(),
    format: z.enum(['csv', 'pdf']),
  })
  .refine(
    (input) => input.format === 'csv' || PDF_ELIGIBLE_REPORT_TYPES.includes(input.report_type),
    {
      message:
        "Le format PDF n'est disponible que pour les rapports de progression et de sécurité.",
      path: ['format'],
    },
  );
export type GenerateReportInput = z.infer<typeof generateReportSchema>;

export const requestDataExportSchema = z.object({
  org_id: z.string().uuid(),
  format: z.enum(['csv', 'json']),
});
export type RequestDataExportInput = z.infer<typeof requestDataExportSchema>;

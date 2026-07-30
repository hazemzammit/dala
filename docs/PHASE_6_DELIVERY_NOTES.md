# Phase 6 delivery — Digest cron, storage bar, PDF reports, multi-project rollup (mobile)

## 0. Read this first

Most of Doc 02 §2.10's "Phase 6+" line was genuinely blocked on product
decisions rather than code — this delivery covers the confirmed-in-scope
subset only. See `docs/MOBILE_IMPLEMENTATION_STATUS.md`'s new Phase 6
section for the full breakdown; summary:

**Shipped**: digest cron wiring, Billing storage-usage bar, PDF for
`progression`/`safety_summary` reports, multi-project rollup dashboard.

**Still blocked, not built against invented spec**: Tier 1 AI (no
algorithm spec, no accumulated data), legal contract templates (still
"pending legal review" per Doc 02 §2.10), seat-based pricing (no seat
definition, no pricing numbers), Konnect billing integration (no
credentials).

**Doc mismatch confirmed**: the 7 `.docx` files provided this session are
a different document set from `docs/spec/*.md` — different files, topics,
and section numbers. Not used for anything code-relevant. If you meant
for those to update the repo spec, that's a separate task — let me know.

## 1. Real gaps found and fixed

- **Digest cron never wired** (Phase 5's own stated gap) — now real
  `pg_cron`/`pg_net` SQL in `0026_phase6_digest_cron_wiring.sql`. Requires
  two manual Vault secret inserts after this migration runs (see below) —
  I don't have and can't fabricate your real project URL/service key.
- **Storage bucket 403 gap** (an "active concern" carried in prior
  session notes) — checked `0025`'s `is_shared_site_log_file()` policy
  before doing anything: **already fixed in Phase 5**, not something this
  phase needed to redo. Flagging so it drops off the active-concerns list.

## 2. What's new

### Migration

- `supabase/migrations/0026_phase6_digest_cron_wiring.sql` — see header
  comment for the full reasoning on why pg_cron/pg_net over a Dashboard
  cron setting.

### Edge Function

- `supabase/functions/generate-report/index.ts` — PDF rendering added for
  `progression`/`safety_summary` via `pdf-lib` (`npm:pdf-lib@1.17.1`).
  `payroll_summary`/`cnss_declaration` unchanged (CSV-only).

### Packages

- `packages/validation/src/exports.ts` — `generateReportSchema.format`
  widened to `'csv' | 'pdf'`, restricted to the two eligible report types
  via `.refine()`.

### Mobile

- `apps/mobile/src/lib/storage.ts` — `getOrgStorageUsageBytes()`,
  `STORAGE_FREE_TIER_LIMIT_BYTES`.
- `apps/mobile/src/app/(contractor)/billing.tsx` — storage-usage bar.
- `apps/mobile/src/app/(contractor)/reports.tsx` — CSV/PDF toggle, binary
  PDF handling via `expo-file-system`'s new `File`/`Paths` API +
  `expo-sharing`.
- `apps/mobile/src/app/(contractor)/project-rollup.tsx` — **new**,
  multi-project rollup dashboard.
- `apps/mobile/src/app/(contractor)/dashboard.tsx` — new "Chantiers" entry
  row.
- `apps/mobile/package.json` — added `expo-file-system` (`~19.0.19`) and
  `expo-sharing` (`~14.0.7`). **Real new native dependencies**, not
  optional — flagged upfront per your instructions, not added silently.
  Versions picked by cross-referencing npm release dates against this
  app's other SDK-54-era `expo-*` pins; worth confirming with
  `npx expo install expo-file-system expo-sharing` against your actual
  installed Expo SDK before merging, since that's the authoritative
  source I don't have local access to verify against.

### Docs

- `docs/spec/02-features-field-ops-multi-org-and-roadmap.md` — new §2.8b,
  resolving what "multi-project rollup dashboard" actually means (was a
  single unexplained line before this phase).
- `docs/MOBILE_IMPLEMENTATION_STATUS.md` — new Phase 6 section.

## 3. Post-merge manual steps (cannot be done from here)

1. Run migration `0026`, then, against your real project:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```
   Without both secrets, `send-digest-notifications-daily` will fire and
   fail (visibly, in `scheduled_job_runs`) rather than silently do
   nothing.
2. `npx expo install expo-file-system expo-sharing` from `apps/mobile` to
   let Expo confirm/correct the exact versions for your installed SDK,
   rather than trusting my npm-registry-date guess.
3. Deploy `generate-report` (`supabase functions deploy generate-report`)
   — it now needs the `pdf-lib` npm import resolved at deploy time.

## 4. Manual test checklist

- [ ] **Digest cron**: after adding Vault secrets, manually trigger
      `select cron.schedule(...)`'s job once via
      `select cron.schedule_in_database(...)` or wait for 05:00 UTC;
      confirm a row appears in `scheduled_job_runs` and pushes/emails
      actually go out to opted-in users.
- [ ] **Storage bar**: Billing screen, free-tier org — bar renders,
      percentage roughly matches actual bucket contents (spot-check
      against Supabase Studio's Storage browser). Upload a large file,
      pull-to-refresh Billing, confirm the bar moves.
- [ ] **PDF reports**: Reports screen → select "Rapport de progression" →
      format toggle appears → select PDF → Generate → native share sheet
      opens with a real, readable PDF (not a blank/corrupt file). Repeat
      for "Résumé de sécurité". Confirm "Résumé de paie"/"Déclaration
      CNSS" do NOT show a PDF toggle (CSV-only, as scoped).
- [ ] **PDF content**: open the generated PDF, confirm org name + date
      range header, table renders with all expected rows, multi-page
      flow works if a project/incident list is long enough to overflow
      one page.
- [ ] **CSV unaffected**: generate a CSV report (any type), confirm the
      existing `Share.share` text-message flow still works exactly as
      before — this pass shouldn't have touched that path's behavior.
- [ ] **Project rollup**: Dashboard → "Chantiers" row → navigates to
      `project-rollup.tsx`. With 0 projects: empty state. With 1+: each
      project shows as its own card with correct status badge, budget bar
      (or "Aucun budget défini" if `budget_total` is null), workers-today
      count, pending-materials count. Cross-check one project's numbers
      manually against Supabase Studio.
- [ ] **Rollup RLS**: as a project member org (not the leading org, if you
      have a multi-org test setup), confirm you do NOT see other orgs'
      projects on this screen — it should only ever show projects the
      _active_ org leads.
- [ ] `tsc --noEmit` — already run clean across `apps/mobile`,
      `packages/validation`, `packages/shared-types` as part of this
      delivery; re-run after `npx expo install` in case that touches
      other type defs.

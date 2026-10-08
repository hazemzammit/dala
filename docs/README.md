# Dala — Documentation Index

`docs/` holds 28 documents with very different lifetimes: a product spec that
is the source of truth for _what_ to build, living engineering docs that must
match the code, and point-in-time artifacts that were accurate the day they
were written and are not any more. Without a map, the third category gets read
as the second — which is exactly how this repo accumulated claims that no
longer matched the code (Next.js 14 instead of 15, "next free migration
number: 0069" at migration 109, three pointers to deleted `PHASE_*_BRIEF.md`
files).

**Read this file first. Then read only the status you need.**

---

## Status legend

Every document under `docs/` is classified in one of the tables below. This
index is the authority on that classification; if a document's own header
disagrees, the tables below win and the header is a bug. New documents must
state their status in their own opening lines.

| Status         | Meaning                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| **LIVING**     | Must match the code today. A PR that invalidates a claim here must update it in the same PR.         |
| **SPEC**       | Product specification. Authoritative for _what_ to build, not for _how it is currently built_.       |
| **PLAN**       | An ordered execution plan. Accurate as a plan; its "gap" descriptions age as the gaps get closed.    |
| **AUDIT**      | A point-in-time analysis of the tree. Evidence is dated by definition; treat findings as historical. |
| **HISTORICAL** | Superseded or completed. Kept for provenance. **Never** use as current guidance.                     |
| **POLICY**     | Legal/compliance text. Draft until a lawyer reviews it; not a description of code.                   |

## Reading order by role

| You are…                     | Read, in this order                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Brand new to the repo**    | `../README.md` → `SETUP_GUIDE.md` → `ARCHITECTURE.md` → `CONTRIBUTING.md`                                                     |
| **Building a feature**       | `spec/00-*.md` §0.4 (platform scope matrix) → the matching `spec/03-*`/`04-*` screen doc → `ARCHITECTURE.md` → `../AGENTS.md` |
| **Working on `apps/admin`**  | `../AGENTS.md` → `ADMIN_IMPLEMENTATION_STATUS.md` → `ARCHITECTURE.md` §"apps/admin" → `audits/dala-admin-ui-overhaul-plan.md` |
| **Working on `apps/mobile`** | `MOBILE_IMPLEMENTATION_STATUS.md` → `spec/03-*.md` → `ARCHITECTURE.md` §"Mobile data-fetching"                                |
| **Working on `apps/web`**    | `spec/04-*.md` → `ARCHITECTURE.md` §"apps/web" → `audits/web-app-consistency-audit-and-plan.md` (AUDIT — re-verify)           |
| **Reviewing a PR**           | `CONTRIBUTING.md` → `../.github/PULL_REQUEST_TEMPLATE.md`                                                                     |

## Living engineering docs

| Document                          | Scope         | Purpose                                                                   |
| --------------------------------- | ------------- | ------------------------------------------------------------------------- |
| `ARCHITECTURE.md`                 | all           | How the code is laid out and **why**. A map, not the spec.                |
| `SETUP_GUIDE.md`                  | all           | Empty machine → first `pnpm dev` running. Follow in order.                |
| `CONTRIBUTING.md`                 | all           | Branching, commits, RLS/migration rules, the test matrix, PR checklist.   |
| `ADMIN_IMPLEMENTATION_STATUS.md`  | `apps/admin`  | What is actually shipped in the Platform Admin app, and what is deferred. |
| `MOBILE_IMPLEMENTATION_STATUS.md` | `apps/mobile` | What is shipped on mobile, plus the consolidated gap-fix roadmap track.   |
| `APP_STORE_READINESS.md`          | `apps/mobile` | Store-submission checklist and what still blocks a submission.            |
| `SYNC_VERIFICATION_RUNBOOK.md`    | `apps/mobile` | How to verify offline sync on a real device (P1-V1/P1-V2).                |
| `DETOX_VERIFICATION.md`           | `apps/mobile` | Detox e2e status and how to actually run the suite.                       |
| `DISASTER_RECOVERY_RUNBOOK.md`    | infra         | Supabase backup/PITR reality, incl. the Storage-bytes exclusion.          |

## Product specification — `docs/spec/`

The source of truth for _what_ the product is. Six files (`00`–`05`); note
`spec/00-*.md` §0.1 still calls the set "five-document" while listing six —
the table there is correct, the prose is not.

| Document                                              | Covers                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `spec/00-foundations-vision-and-decisions.md`         | Vision, **§0.4 platform scope matrix** (authoritative for scope), risk register |
| `spec/01-data-model-security-and-architecture.md`     | Full schema, RLS, auth/security architecture, tech stack, ops                   |
| `spec/02-features-field-ops-multi-org-and-roadmap.md` | Every functional module, multi-org collaboration, build roadmap, testing        |
| `spec/03-screens-mobile-contractor-and-worker.md`     | Screen-by-screen spec, mobile                                                   |
| `spec/04-screens-web-contractor-and-admin.md`         | Screen-by-screen spec, web + Platform Admin                                     |
| `spec/05-design-system-and-ux-spec.md`                | Design tokens, motion/haptics, illustration system, component inventory         |

When `spec/00` §0.4's platform scope matrix disagrees with a screen doc, **the
matrix wins** (`CONTRIBUTING.md` states this as the rule).

## Plans and audits

| Document                                        | Status | Scope        | Notes                                                                                                        |
| ----------------------------------------------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `DALA_GAPS_AND_FIXES_PLAN.md`                   | PLAN   | mobile-first | The post-launch gap-fix roadmap. §0's guardrails are still cited by `ARCHITECTURE.md`.                       |
| `audits/dala-admin-ui-overhaul-plan.md`         | PLAN   | `apps/admin` | **Currently governing** — `../AGENTS.md` makes its rules standing for every session.                         |
| `audits/phase-4.7-visual-polish-remediation.md` | AUDIT  | `apps/admin` | Newer and more specific than `premium-ux-system-guide.md` where the two disagree.                            |
| `audits/premium-ux-system-guide.md`             | AUDIT  | `apps/admin` | Token/component/state spec plus a page-by-page walkthrough.                                                  |
| `audits/phase-4.5-premium-polish.md`            | AUDIT  | `apps/admin` | Superseded by 4.7 for anything the two cover in common.                                                      |
| `audits/web-app-consistency-audit-and-plan.md`  | AUDIT  | `apps/web`   | Verified against the tree at time of writing — re-verify before acting.                                      |
| `audits/web-consistency-plan-verified.md`       | PLAN   | `apps/web`   | Sequencing pass over the above. Several items are already implemented — check `git log` before starting one. |

## Historical — do not use as current guidance

| Document                                | Era / why it is historical                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `dala-admin-delivery-guide.md`          | Migrations `0021`–`0023`. Written as "what's in the zip" for a handoff. Superseded by `ADMIN_IMPLEMENTATION_STATUS.md`. |
| `DELIVERY_NOTES.md`                     | A single session's notes (migrations through `0032`). Superseded by `ADMIN_IMPLEMENTATION_STATUS.md`.                   |
| `dala-web-org-creation-parity-guide.md` | Marked **IMPLEMENTED** at its own top. The web org-creation wizard shipped.                                             |

## Policy drafts — need legal review before publication

| Document                   | Language | Notes                                                                              |
| -------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `PRIVACY_POLICY.md`        | French   | Drafted from the real schema. The in-app link it names still points at a dead URL. |
| `DATA_RETENTION_POLICY.md` | French   | Table-by-table retention, derived from `supabase/migrations/`.                     |

---

## Adding or changing a document

1. Pick a status from the legend above and state it in the document's own first
   lines. A doc with no status reads as LIVING by default — which is how
   `DELIVERY_NOTES.md` got mistaken for a status report.
2. Add a row to the matching table in this file.
3. If the document is mobile-facing, remember `../AGENTS.md` makes
   `apps/mobile/**` read-only during the admin UI overhaul.
4. Prefer a verifiable claim over a prose one: every count, version, and list in
   a LIVING doc should be re-derivable by a command a reader can run. Put that
   command in the doc.
5. Run `npx prettier --write <file>`. Prettier formats Markdown in this repo and
   `lint-staged` re-formats it on commit, so an unformatted table shows up as a
   diff in someone else's PR.

## Re-deriving the facts in this index

```powershell
# Document inventory
Get-ChildItem docs -Recurse -File -Filter *.md | ForEach-Object { $_.FullName.Replace("$PWD\","") }

# Migrations — this index and ARCHITECTURE.md cite the highest number
Get-ChildItem supabase/migrations -File | Measure-Object | Select-Object -ExpandProperty Count

# Broken internal doc references — should print nothing
$files = Get-ChildItem docs -Recurse -File -Filter *.md
$intentional = @('docs/PHASE_1_BRIEF.md', 'docs/spec/03-architecture-apis-and-ops.md')
foreach ($f in $files) {
  Get-Content $f.FullName -Raw | Select-String -AllMatches 'docs/[A-Za-z0-9_\-/\.]+\.md' |
    ForEach-Object { $_.Matches } | ForEach-Object { $_.Value } | Sort-Object -Unique |
    Where-Object { -not (Test-Path $_) -and $_ -notin $intentional } |
    ForEach-Object { "$_   <- $($f.Name)" }
}
```

**Two deliberate exceptions, excluded above — do not "fix" these.**
`MOBILE_IMPLEMENTATION_STATUS.md` mentions `docs/PHASE_1_BRIEF.md` and
`docs/spec/03-architecture-apis-and-ops.md`, and neither file exists. Both
mentions are _prose about files that don't exist_: the first explains that the
twelve brief files were consolidated into that document and deleted from
`docs/`; the second records that a migration's own header cited a path that
never existed. Rewriting either to a live path would destroy the record. That's
why the check carries an explicit skip-list rather than a bare `Test-Path`.

# Backup & disaster recovery runbook

Phase 12 (improvement-plan §10.6). Facts about Supabase's actual PITR behavior below
were confirmed via web search against current (2026) Supabase documentation before
writing this — not assumed from training data, per the plan's own instruction.

## What Supabase's platform actually gives you, confirmed current

- **Daily backups** are automatic on Pro/Team/Enterprise plans — 7 days of retention on
  Pro, 14 on Team, 30 on Enterprise.
- **PITR (Point-in-Time Recovery)** is a paid add-on on top of that (not included by
  default even on Pro), billed hourly, requiring at least a "Small" compute add-on.
  Retention windows and pricing are configured per-project in the dashboard.
- **Critical exclusion, confirmed across multiple current sources: neither daily
  backups nor PITR cover Supabase Storage file bytes.** A database restore brings back
  `storage.objects` _metadata_ (filenames, paths) pointing at files that were NOT
  restored — the actual file bytes in the bucket reflect whatever the CURRENT state is,
  not the point in time being restored to. This is a real, disclosed gap for THIS
  product specifically: `docs/PRIVACY_POLICY.md` (this same phase) names photos, voice
  notes, and expense-receipt images as real, actively-used Storage content — a database
  restore alone would leave the app referencing broken/mismatched file links for any
  photo/voice-note uploaded or deleted between the restore point and now.
- Recovery point precision under PITR is roughly WAL-archive-interval granularity (on
  the order of minutes, not hours) — good enough to recover from "a bad migration" or
  "an accidental mass UPDATE" scenario, which is the realistic failure mode for a
  project this size (a schema bug, not a multi-region outage).

## What this means for Dala specifically

This repo has never had PITR enabled or even discussed as a project setting (confirmed
by grepping `supabase/config.toml` and every doc in this repo before writing this — no
mention anywhere prior to this phase). **This is a real, standing gap**, not a
hypothetical one: today, a destructive migration or an accidental `DELETE` without a
`WHERE` clause against the live project has no recovery path beyond whatever daily
backup window the current plan tier provides — flagged plainly, not softened.

## Restore-drill runbook

1. **Trigger.** Any of: a migration applied to production that's discovered to have
   corrupted or deleted data; a manual operational error (a bad `UPDATE`/`DELETE` run
   directly against the database); suspected data corruption reported by a user that
   traces back to a specific window in time.
2. **Who's responsible.** The person holding Supabase project-owner access for the
   `hazemzammits-team` org — this is an organizational fact this sandbox cannot assign a
   name to; document the actual on-call/owner identity in this file once decided, rather
   than leaving it unnamed indefinitely.
3. **Before restoring — freeze writes if at all possible.** Put the app in maintenance
   mode (no existing mechanism for this in the repo today — flagged as a real gap; the
   nearest existing lever is `app_version_check()`'s force-update path, which was NOT
   designed for this purpose and shouldn't be repurposed for it without review) or at
   minimum communicate a write freeze to the pilot user before restoring, since any
   write that happens between "corruption discovered" and "restore executed" is at risk
   of being silently overwritten by the restore.
4. **Restore via the Supabase dashboard** (Project Settings → Backups → choose a backup
   or a PITR timestamp → Restore). This creates a NEW project state — confirm with
   Supabase's own current documentation at restore time whether this is an in-place
   restore or a restore-to-new-project flow, since that detail is exactly the kind of
   platform behavior this runbook's own instructions say to verify fresh rather than
   trust to have stayed the same.
5. **Storage reconciliation (the gap named above).** After a database restore,
   cross-check `storage.objects` rows against what's actually in the bucket — any file
   referenced by a restored row that no longer has a matching object (or vice versa: an
   object with no matching row) needs manual reconciliation. There is no automated
   tooling for this in the repo today; this is genuinely manual work post-restore.
6. **Verify data integrity.** Spot-check: does the restored `organizations` count match
   expectations? Do a handful of recently-active orgs' `attendance_records` look
   complete for the period just before the incident? Confirm RLS still behaves correctly
   post-restore (a restore that somehow reverted a migration touching RLS policies would
   be its own distinct, worse failure mode).
7. **Post-mortem.** Document what caused the need for the restore, in this same repo's
   `docs/` — this runbook should accumulate real incident history over time, not stay a
   theoretical document forever.

## What's achievable here vs. not

Achievable: this documented runbook, grounded in confirmed-current Supabase behavior
(done). Not achievable in this sandbox: actually enabling PITR on a real project (no
project/billing access here), actually running a restore drill against a real Supabase
instance, or confirming today's exact restore-to-new-project vs. in-place behavior
first-hand (the runbook above says to re-verify this at restore time for exactly that
reason — this document is not a substitute for checking Supabase's own current docs at
the moment of a real incident).

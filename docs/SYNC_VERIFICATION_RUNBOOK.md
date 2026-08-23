# Offline sync verification runbook

Phase 12 (improvement-plan §10.1). Carried forward as P1-V1/P1-V2 since Phase 1 (11
phases) with no new artifact — this is that artifact. Decision made per the plan's own
(a)/(b) fork: **(a)** — a real runbook + an executable smoke-test script, not another
one-line carry-forward. Reasoning: after 11 phases of "still unverified," a 12th prose
disclaimer adds nothing a person with a device could act on. This does.

## What changed this phase that makes this newly relevant

Before writing this runbook, Phase 12 found and fixed a **blocking bug**: `db/index.ts`
(the module every offline-first screen imports `{ database }` from) had been wrongly
holding a stale copy of the sync orchestrator instead of the actual WatermelonDB
`Database` bootstrap — see that file's own header comment and `db/sync/index.ts`'s for
the full trace. **This means no live-device sync verification could ever have succeeded
against the code as it stood before this phase — the app could not have compiled.**
P1-V1/P1-V2 were carried forward for 11 phases not because verification was merely
deferred, but because the code underneath it was silently broken the entire time. This
is disclosed plainly, not softened: this is the single most important finding in this
phase.

With that fixed, this runbook is now genuinely actionable.

## Part A — one-time environment setup

1. `pnpm install` at the repo root (this sandbox has never run this — see
   P10-V7/P11-V5's own standing caveat, still true here).
2. `supabase start` (or point at a real hosted project) — apply every migration through
   `0077_phase12_launch_readiness.sql`.
3. `cd apps/mobile && npx expo prebuild` — generates `ios/`/`android/` from `app.json`,
   required for WatermelonDB's JSI adapter (`db/index.ts`'s own header explains why this
   specifically needs a native build, not just Expo Go).
4. `npx expo run:ios` or `npx expo run:android` — a real simulator/emulator, or a
   physical device.
5. Seed a test org, one worker, and one project via the app's own sign-up + invite flow
   (not a raw SQL insert — the point is to exercise the same paths a real user would).

## Part B — manual verification checklist (P1-V1/P1-V2's original scope)

Run through in order, on a **real device or simulator**, not this sandbox:

- [ ] **Cold start with no network.** Launch the app in airplane mode after at least one
      successful prior sync. Confirm the five WatermelonDB-backed screens (dispatch,
      pointage, worker home, advance-request, material-request) render from local data —
      no spinner-forever, no crash.
- [ ] **Write while offline.** With airplane mode still on, create a site log entry
      (`SiteLogForm.tsx`) and a material request. Confirm both appear immediately in their
      respective lists (optimistic local write).
- [ ] **Sync on reconnect.** Disable airplane mode. Confirm `OfflineBanner` transitions
      through "Synchronisation…" to "Synchronisé" (or "Échec de synchronisation" — either is
      a pass for THIS check, since the point is confirming the state machine fires at all,
      which — per this phase's own fix — it could not have before). Confirm the two offline
      writes now exist server-side (check via the Supabase dashboard or `psql`).
- [ ] **Push-to-pull round trip.** From the web admin panel (or a second device), edit
      the same project's `dispatch_assignments` row that's shown in `DispatchConflictsSheet.tsx`
      test data. Foreground the mobile app. Confirm the change appears without a manual
      pull.
- [ ] **Conflict path.** Edit the same `dispatch_assignments` row on two devices while
      each is offline, then bring both online. Confirm `DispatchAssignmentConflict` rows are
      created locally (query via `database.get('dispatch_assignment_conflicts')` in a debug
      console, or check `DispatchConflictsSheet.tsx` renders the conflict) rather than one
      write silently clobbering the other.
- [ ] **Sentry actually receives the sync-failure report.** Force a sync failure (e.g.
      temporarily revoke the anon key), confirm a `runSync` catch block fires (console log
      `[sync] failed`), and confirm the event actually appears in the Sentry project
      dashboard — this is a **new** check this phase adds, since `Sentry.init()` was never
      called before this phase either (see `lib/sentry.ts`'s own header) — the sync-failure
      `Sentry.captureException` call has existed since Phase 18 but could never have reached
      Sentry's backend until now.

## Part C — automated smoke test

`scripts/smoke-test-sync.ts` (this phase) is a standalone Node script — **not** a Detox
spec, and **not** run inside the mobile app at all. It exercises the SERVER side of the
sync contract directly against a real Supabase instance using `@supabase/supabase-js`,
the same `pullChanges`/`pushChanges` request/response shape `apps/mobile/src/db/sync/pullChanges.ts`
and `pushChanges.ts` implement, without needing a device at all. It cannot verify the
on-device WatermelonDB/JSI half (that's Part B's job) — it verifies the half that
_can_ be checked without a simulator: that the Edge Functions/RPCs those two files call
respond with the shape the client-side sync adapter expects.

Run:

```bash
cd apps/mobile
SUPABASE_URL=... SUPABASE_ANON_KEY=... E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... \
  npx tsx ../../scripts/smoke-test-sync.ts
```

Exits non-zero with a specific failing check name on any mismatch, so it's CI-usable
once a real Supabase instance is available to CI (not the case in this sandbox).

## What this sandbox genuinely cannot do

No physical device, no iOS/Android simulator, no live Supabase project with real
network conditions to flip airplane mode against. Part B above cannot be run here —
flagged, not faked. Part A/C's _scripts and config_ are written and syntax-checked here;
their _execution_ is the same "needs a human with the real environment" category as
every other item in this phase's §2 (Detox) and §5 (backup/DR).

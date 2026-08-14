import {
  asUser,
  createFixtures,
  hasLocalSupabaseEnv,
  teardownFixtures,
  type AttendanceFixtures,
} from './fixtures';

/**
 * apps/mobile/src/test/attendance/reconciliation.test.ts
 *
 * Doc 01 §1.14.3 / Doc 02 §2.11's "Attendance reconciliation" row: "Write a
 * manual attendance record, then a dispatch check-in for the same
 * worker/day. Asserts the manual entry is preserved, not silently
 * overwritten."
 *
 * Phase 13 update: this file's own header used to say there was no
 * resolver to test, only the DB-level append-only guarantee — that gap is
 * now closed by migration 0036's `attendance_effective` view. This file
 * now has TWO describe blocks:
 *
 *   1. "Append-only guarantee" (unchanged from Phase 12) — asserts
 *      `attendance_records` itself never mutates a manual row when a later
 *      dispatch check-in arrives. Still true, still worth asserting
 *      directly rather than only through the view.
 *   2. "attendance_effective resolver (0036)" (new this phase) — asserts
 *      the view actually returns the manual_pointage row for a conflict
 *      day, regardless of insert order (manual-then-dispatch AND
 *      dispatch-then-manual), and returns the latest row when only one
 *      source exists for the day.
 *
 * Written and checked against the actual schema/view definition (0007,
 * 0036) but NOT executed against a live instance — no Docker/local
 * Supabase available in this session. Same disclosed limitation as every
 * other integration suite in this repo.
 */

const maybeDescribe = hasLocalSupabaseEnv() ? describe : describe.skip;

if (!hasLocalSupabaseEnv()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[reconciliation.test.ts] Skipped — EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Run `supabase start` and set these to actually run this suite ' +
      '(see jest.integration.config.js).',
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

maybeDescribe('Attendance reconciliation (Doc 01 §1.14.3)', () => {
  let fixtures: AttendanceFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  }, 30_000);

  afterAll(async () => {
    if (fixtures) await teardownFixtures(fixtures);
  }, 30_000);

  describe('Append-only guarantee', () => {
    it('a manual entry is preserved, unmutated, after a later dispatch check-in for the same worker/day', async () => {
      const client = await asUser(fixtures.owner);
      const date = todayISO();

      // Step 1 — manual pointage entry, mirroring pointage.tsx's own insert
      // shape exactly (org_id, worker_id, record_date, status, source — no
      // recorded_by set, matching that screen's actual code). Deliberately
      // 'absent' here (not 'present') so the two rows are trivially
      // distinguishable in the assertions below.
      const manualInsert = await client
        .from('attendance_records')
        .insert({
          org_id: fixtures.orgId,
          worker_id: fixtures.workerId,
          record_date: date,
          status: 'absent',
          source: 'manual_pointage',
        })
        .select('id')
        .single();
      expect(manualInsert.error).toBeNull();
      const manualRowId = manualInsert.data!.id as string;

      // Step 2 — a dispatch check-in for the SAME worker/day, mirroring
      // (worker)/home.tsx's handleArrived() insert shape exactly.
      const dispatchInsert = await client
        .from('attendance_records')
        .insert({
          org_id: fixtures.orgId,
          worker_id: fixtures.workerId,
          record_date: date,
          status: 'present',
          source: 'dispatch_checkin',
        })
        .select('id')
        .single();
      expect(dispatchInsert.error).toBeNull();
      const dispatchRowId = dispatchInsert.data!.id as string;

      // Assertion 1 — both rows exist. Append-only means the second insert
      // was never going to overwrite the first at the DB layer, but this
      // confirms it as a fact rather than an assumption from reading 0007.
      const { data: allRows, error: allErr } = await client
        .from('attendance_records')
        .select('id, status, source')
        .eq('worker_id', fixtures.workerId)
        .eq('record_date', date);
      expect(allErr).toBeNull();
      expect(allRows).toHaveLength(2);

      // Assertion 2 — the manual row's own fields are completely untouched:
      // still 'absent', still 'manual_pointage', same id. This is the actual
      // "preserved, not silently overwritten" guarantee Doc 01 §1.14.3 asks
      // for — re-fetching the SAME row by id, not just counting rows.
      const { data: manualRowNow, error: manualErr } = await client
        .from('attendance_records')
        .select('id, status, source')
        .eq('id', manualRowId)
        .single();
      expect(manualErr).toBeNull();
      expect(manualRowNow?.status).toBe('absent');
      expect(manualRowNow?.source).toBe('manual_pointage');

      // Assertion 3 — the dispatch check-in row also persisted correctly,
      // as its own separate row, not merged into or replacing the manual one.
      const { data: dispatchRowNow, error: dispatchErr } = await client
        .from('attendance_records')
        .select('id, status, source')
        .eq('id', dispatchRowId)
        .single();
      expect(dispatchErr).toBeNull();
      expect(dispatchRowNow?.status).toBe('present');
      expect(dispatchRowNow?.source).toBe('dispatch_checkin');
    });
  });

  describe('attendance_effective resolver (migration 0036)', () => {
    it('prefers the manual_pointage row when manual is inserted BEFORE dispatch', async () => {
      const client = await asUser(fixtures.owner);
      const date = todayISO();

      await client.from('attendance_records').insert({
        org_id: fixtures.orgId,
        worker_id: fixtures.workerId,
        record_date: date,
        status: 'absent',
        source: 'manual_pointage',
      });
      await client.from('attendance_records').insert({
        org_id: fixtures.orgId,
        worker_id: fixtures.workerId,
        record_date: date,
        status: 'present',
        source: 'dispatch_checkin',
      });

      const { data, error } = await client
        .from('attendance_effective')
        .select('status, source')
        .eq('worker_id', fixtures.workerId)
        .eq('record_date', date)
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe('absent');
      expect(data?.source).toBe('manual_pointage');
    });

    it('prefers the manual_pointage row when manual is inserted AFTER dispatch — insert order must not matter', async () => {
      const client = await asUser(fixtures.owner);
      // A different day from the previous test, so this test doesn't
      // depend on execution order or share state with it.
      const date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

      await client.from('attendance_records').insert({
        org_id: fixtures.orgId,
        worker_id: fixtures.workerId,
        record_date: date,
        status: 'present',
        source: 'dispatch_checkin',
      });
      await client.from('attendance_records').insert({
        org_id: fixtures.orgId,
        worker_id: fixtures.workerId,
        record_date: date,
        status: 'half_day',
        source: 'manual_pointage',
      });

      const { data, error } = await client
        .from('attendance_effective')
        .select('status, source')
        .eq('worker_id', fixtures.workerId)
        .eq('record_date', date)
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe('half_day');
      expect(data?.source).toBe('manual_pointage');
    });

    it('falls back to the row present when only one source exists for the day', async () => {
      const client = await asUser(fixtures.owner);
      const date = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

      await client.from('attendance_records').insert({
        org_id: fixtures.orgId,
        worker_id: fixtures.workerId,
        record_date: date,
        status: 'present',
        source: 'dispatch_checkin',
      });

      const { data, error } = await client
        .from('attendance_effective')
        .select('status, source')
        .eq('worker_id', fixtures.workerId)
        .eq('record_date', date)
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe('present');
      expect(data?.source).toBe('dispatch_checkin');
    });

    it('returns exactly one row per (worker_id, record_date) even with both sources present — the double-count bug this view fixes', async () => {
      const client = await asUser(fixtures.owner);
      const date = todayISO(); // reuses the first test's conflict day

      const { data, error } = await client
        .from('attendance_effective')
        .select('id')
        .eq('worker_id', fixtures.workerId)
        .eq('record_date', date);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });
});

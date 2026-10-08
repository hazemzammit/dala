import {
  asUser,
  createFixtures,
  hasLocalSupabaseEnv,
  serviceClient,
  teardownFixtures,
  type RlsFixtures,
} from './fixtures';

/**
 * apps/mobile/src/test/rls/rlsMatrix.test.ts
 *
 * Doc 01 §1.5 / Doc 02 §2.11's "RLS / security" row — "the single
 * highest-severity thing to regress." Run with `pnpm test:rls` against a
 * local Supabase instance (`supabase start`), never as part of the default
 * `pnpm test` — see jest.integration.config.js's header for why.
 *
 * Scope, stated honestly: this covers cross-org isolation and the
 * project-membership visibility model (the two things Doc 02 §2.11 singles
 * out as most load-bearing), the specific regression test Doc 02 §2.11
 * calls out by name — a permission change taking effect on the very
 * next request, guarding against ever going back to JWT-claims-based
 * checks — and, added alongside 0035_dispatch_assignments_project_
 * participation.sql, a direct regression test for that fix (an
 * unrelated org can't create a dispatch_assignment on a project it has
 * no real association with, while the project's own lead org still can,
 * despite having no explicit project_memberships row for itself — see
 * 0034/0035's headers for why that distinction matters). It does NOT
 * cover the idempotency, offline-conflict, or attendance-reconciliation
 * rows from that same table — those are their own follow-up phase, per
 * this phase's scoping conversation.
 *
 * Phase 14 adds two more describe blocks: a direct regression test for the
 * `security_invoker` fix on `active_projects`/`active_workers` (0037 —
 * asserts an unrelated org querying either view directly sees nothing of
 * another org's rows, the exact leak that migration closes), and a direct
 * regression test for the archived-project write freeze (0038 — asserts a
 * direct insert/update against `project_workers` or `dispatch_assignments`
 * on an archived project is now actually rejected server-side, not just
 * hidden client-side).
 *
 * Every assertion below goes through `asUser()` — a real signed-in
 * anon-key client — never the service-role client used only inside
 * fixtures.ts to set data up. That's the whole point: these tests are
 * worthless if they run with RLS bypassed.
 *
 * Written but NOT executed against a live instance from this session — no
 * Docker/local Supabase available here. Same disclosed limitation as every
 * other live-verification item this phase; "written" is not "passed."
 */

const maybeDescribe = hasLocalSupabaseEnv() ? describe : describe.skip;

if (!hasLocalSupabaseEnv()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[rlsMatrix.test.ts] Skipped — EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Run `supabase start` and set these to actually run this suite ' +
      '(see jest.integration.config.js).',
  );
}

maybeDescribe('RLS permission matrix (Doc 01 §1.5)', () => {
  let fixtures: RlsFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  }, 30_000);

  afterAll(async () => {
    if (fixtures) await teardownFixtures(fixtures);
  }, 30_000);

  describe('Cross-org isolation', () => {
    it("Org C (no relationship to Org A) cannot read Org A's workers", async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client.from('workers').select('id').eq('org_id', fixtures.orgA);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org C cannot read Org A's vehicles", async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('vehicles')
        .select('id')
        .eq('org_id', fixtures.orgA);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org C cannot read Org A's dispatch_assignments", async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('dispatch_assignments')
        .select('id')
        .eq('org_id', fixtures.orgA);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org C cannot read Org A's project_expenses", async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('project_expenses')
        .select('id')
        .eq('org_id', fixtures.orgA);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org C — not a project member — cannot read Org A's shared project row either", async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('projects')
        .select('id')
        .eq('id', fixtures.sharedProjectId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org A owner CAN read its own org's workers (sanity check — isolation isn't over-blocking)", async () => {
      const client = await asUser(fixtures.ownerA);
      const { data, error } = await client.from('workers').select('id').eq('id', fixtures.workerA);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });

  describe('Project-membership visibility model (Doc 02 §2.8)', () => {
    it('Org B (trade participant) CAN read the shared project row', async () => {
      const client = await asUser(fixtures.ownerB);
      const { data, error } = await client
        .from('projects')
        .select('id')
        .eq('id', fixtures.sharedProjectId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("Org B CANNOT read Org A's project_expenses on the shared project — Private layer, lead-org-only (Doc 02 §2.8)", async () => {
      const client = await asUser(fixtures.ownerB);
      const { data, error } = await client
        .from('project_expenses')
        .select('id')
        .eq('project_id', fixtures.sharedProjectId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org B CANNOT read Org A's dispatch_assignments on the shared project either — dispatch_assignments RLS is org_id-scoped, not project-membership-scoped (confirms project/[id].tsx's Phase 11 comment: each org only ever sees its own dispatch rows)", async () => {
      const client = await asUser(fixtures.ownerB);
      const { data, error } = await client
        .from('dispatch_assignments')
        .select('id')
        .eq('project_id', fixtures.sharedProjectId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('Org A (lead) CAN read its own project_expenses and dispatch_assignments on the project', async () => {
      const client = await asUser(fixtures.ownerA);
      const [expenses, assignments] = await Promise.all([
        client.from('project_expenses').select('id').eq('id', fixtures.expenseId),
        client.from('dispatch_assignments').select('id').eq('id', fixtures.dispatchAssignmentId),
      ]);
      expect(expenses.error).toBeNull();
      expect(expenses.data).toHaveLength(1);
      expect(assignments.error).toBeNull();
      expect(assignments.data).toHaveLength(1);
    });
  });

  describe('Permission changes take effect on the very next request (Doc 02 §2.11)', () => {
    it('demoting a manager to viewer immediately blocks a write that was allowed a moment before — no caching, no stale JWT claim', async () => {
      const managerClient = await asUser(fixtures.managerA);

      // Before demotion: manager can write to an owner/manager-gated table.
      const before = await managerClient
        .from('vehicles')
        .insert({ org_id: fixtures.orgA, name: 'Pre-demotion vehicle', capacity: 2 })
        .select('id')
        .single();
      expect(before.error).toBeNull();
      expect(before.data).not.toBeNull();

      // Demote through the app's own owner-only RPC. (Migration 0098 removed the
      // owner's direct write access to organization_members — role changes are
      // RPC-only now, so the old `.from('organization_members').update()`
      // would be rejected. The point under test is still the RLS predicate.)
      const admin = await asUser(fixtures.ownerA);
      const { error: demoteError } = await admin.rpc('update_organization_member_role', {
        p_org_id: fixtures.orgA,
        p_user_id: fixtures.managerA.userId,
        p_role: 'viewer',
      });
      expect(demoteError).toBeNull();

      // Immediately after, on the SAME already-authenticated client — no
      // new sign-in, no token refresh — the write must now be rejected.
      // org_role_of() is a live table lookup evaluated per request, so
      // this must fail with no propagation delay.
      const after = await managerClient
        .from('vehicles')
        .insert({ org_id: fixtures.orgA, name: 'Post-demotion vehicle', capacity: 2 })
        .select('id')
        .single();
      expect(after.error).not.toBeNull();
      expect(after.data).toBeNull();
    });
  });

  describe('Project-membership revocation takes effect on the very next request', () => {
    it("removing Org B's project_memberships row immediately revokes its read access to the project", async () => {
      const tradeClient = await asUser(fixtures.ownerB);

      const before = await tradeClient
        .from('projects')
        .select('id')
        .eq('id', fixtures.sharedProjectId);
      expect(before.error).toBeNull();
      expect(before.data).toHaveLength(1);

      const admin = await asUser(fixtures.ownerA);
      const { error: revokeError } = await admin
        .from('project_memberships')
        .delete()
        .eq('project_id', fixtures.sharedProjectId)
        .eq('org_id', fixtures.orgB);
      expect(revokeError).toBeNull();

      const after = await tradeClient
        .from('projects')
        .select('id')
        .eq('id', fixtures.sharedProjectId);
      expect(after.error).toBeNull();
      expect(after.data).toEqual([]);
    });
  });

  describe('dispatch_assignments requires real project participation on insert (0035)', () => {
    it('Org C — not a participant on the shared project at all — cannot create a dispatch_assignment on it', async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('dispatch_assignments')
        .insert({
          org_id: fixtures.orgC,
          project_id: fixtures.sharedProjectId,
          worker_id: fixtures.workerA, // irrelevant to this check — insert is rejected on project_id alone
          assignment_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('Org A (the project lead, with no explicit project_memberships row for itself — see 0034/0035 headers) CAN still create a dispatch_assignment on its own project', async () => {
      const client = await asUser(fixtures.ownerA);
      const { data, error } = await client
        .from('dispatch_assignments')
        .insert({
          org_id: fixtures.orgA,
          project_id: fixtures.sharedProjectId,
          worker_id: fixtures.workerA,
          assignment_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('a dispatch_assignment with no project_id at all (maintenance/unassigned) is unaffected by this check', async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('workers')
        .insert({ org_id: fixtures.orgC, full_name: 'Org C scratch worker' })
        .select('id')
        .single();
      expect(error).toBeNull();
      const scratchWorkerId = data!.id as string;

      const assignment = await client
        .from('dispatch_assignments')
        .insert({
          org_id: fixtures.orgC,
          project_id: null,
          worker_id: scratchWorkerId,
          assignment_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();
      expect(assignment.error).toBeNull();
      expect(assignment.data).not.toBeNull();
    });
  });

  describe('active_projects / active_workers security_invoker fix (0037)', () => {
    it("Org C cannot read Org A's rows via active_projects directly — the exact leak security_invoker=true closes", async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('active_projects')
        .select('id')
        .eq('id', fixtures.sharedProjectId);
      // Before 0037 (if the view-owner-BYPASSRLS assumption held in this
      // project's actual config, per 0036/0037's own disclosed uncertainty)
      // this would have returned Org A's row to an unrelated caller. After
      // 0037, RLS runs as the querying user (Org C), and
      // projects_select_lead_or_trade correctly excludes it.
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org C cannot read Org A's rows via active_workers directly — same fix, same shape", async () => {
      const client = await asUser(fixtures.ownerC);
      const { data, error } = await client
        .from('active_workers')
        .select('id')
        .eq('id', fixtures.workerA);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("Org A (the actual owner) still CAN read its own rows via both views — the fix isn't over-blocking", async () => {
      const client = await asUser(fixtures.ownerA);
      const [projects, workers] = await Promise.all([
        client.from('active_projects').select('id').eq('id', fixtures.sharedProjectId),
        client.from('active_workers').select('id').eq('id', fixtures.workerA),
      ]);
      expect(projects.error).toBeNull();
      expect(projects.data).toHaveLength(1);
      expect(workers.error).toBeNull();
      expect(workers.data).toHaveLength(1);
    });
  });

  describe('Archived-project write freeze (0038)', () => {
    // Scoped to its own project, created and torn down inside this
    // describe block, so flipping its status doesn't affect any other
    // describe block's assumptions about fixtures.sharedProjectId (which
    // stays 'active' for the whole suite).
    let archivedProjectId: string;

    beforeAll(async () => {
      const admin = serviceClient();
      const { data, error } = await admin
        .from('projects')
        .insert({
          lead_org_id: fixtures.orgA,
          name: 'RLS Test Archived Project',
          status: 'archived',
          created_by: fixtures.ownerA.userId,
        })
        .select('id')
        .single();
      if (error || !data)
        throw new Error(`Failed to create archived test project: ${error?.message}`);
      archivedProjectId = data.id as string;
    }, 30_000);

    afterAll(async () => {
      if (archivedProjectId) {
        await serviceClient().from('projects').delete().eq('id', archivedProjectId);
      }
    }, 30_000);

    it('Org A (lead, otherwise a valid participant) CANNOT insert a project_workers row on an archived project', async () => {
      const client = await asUser(fixtures.ownerA);
      const { data, error } = await client
        .from('project_workers')
        .insert({ project_id: archivedProjectId, worker_id: fixtures.workerA })
        .select('id')
        .single();
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('Org A CANNOT insert a dispatch_assignment scoped to an archived project', async () => {
      const client = await asUser(fixtures.ownerA);
      const { data, error } = await client
        .from('dispatch_assignments')
        .insert({
          org_id: fixtures.orgA,
          project_id: archivedProjectId,
          vehicle_id: fixtures.vehicleA,
          worker_id: fixtures.workerA,
          assignment_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('Org A CAN still insert a project_workers row on the (active) shared project — the freeze is status-scoped, not a blanket regression', async () => {
      const client = await asUser(fixtures.ownerA);
      const admin = serviceClient();
      const { data: scratchWorker, error: workerErr } = await admin
        .from('workers')
        .insert({ org_id: fixtures.orgA, full_name: 'Archived-freeze scratch worker' })
        .select('id')
        .single();
      expect(workerErr).toBeNull();

      const { data, error } = await client
        .from('project_workers')
        .insert({ project_id: fixtures.sharedProjectId, worker_id: scratchWorker!.id as string })
        .select('id')
        .single();
      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('Removing a worker (UPDATE setting removed_at) on an archived project is also rejected, not just adding one', async () => {
      const admin = serviceClient();
      // Seed a project_workers row directly via service-role (bypassing
      // RLS for setup only, per this suite's own convention) so there's
      // something to attempt removing.
      const { data: row, error: seedErr } = await admin
        .from('project_workers')
        .insert({ project_id: archivedProjectId, worker_id: fixtures.workerA })
        .select('id')
        .single();
      expect(seedErr).toBeNull();

      const client = await asUser(fixtures.ownerA);
      const { error } = await client
        .from('project_workers')
        .update({ removed_at: new Date().toISOString(), removed_by: fixtures.ownerA.userId })
        .eq('id', row!.id as string);
      // UPDATE's own with-check requires is_project_active(); the row
      // exists (using-clause allows targeting it) but the write is
      // rejected because the resulting row still points at an archived
      // project.
      expect(error).not.toBeNull();
    });
  });
});

import {
  asUser,
  backdateDeletedAt,
  createFixtures,
  createProject,
  hasLocalSupabaseEnv,
  teardownFixtures,
  type SoftDeleteFixtures,
} from './fixtures';

/**
 * apps/mobile/src/test/soft-delete/restore.test.ts
 *
 * Doc 01 §1.16.2 / Doc 02 §2.11's soft-delete/restore row: "delete a
 * project, assert excluded from normal queries but restorable within 30
 * days, then assert purge_soft_deleted_records removes it after."
 *
 * Three describe blocks, each with its own project (never shared state
 * across assertions):
 *   1. Soft delete excludes from active_projects, doesn't touch `projects`
 *      itself.
 *   2. Restore works inside the 30-day window; does NOT work once
 *      deleted_at is older than 30 days (restore_project's own predicate,
 *      not a separate check this suite invents).
 *   3. purge_soft_deleted_records() actually removes a >30-day-old
 *      soft-deleted row, and leaves a <30-day-old one untouched.
 *
 * Written and checked against the actual RPC bodies (0013, overridden by
 * 0025 for the current purge signature) but NOT executed against a live
 * instance from this session — no Docker/local Supabase available here.
 */

const maybeDescribe = hasLocalSupabaseEnv() ? describe : describe.skip;

if (!hasLocalSupabaseEnv()) {
  // eslint-disable-next-line no-console
  console.warn(
    'Skipping soft-delete/restore suite: EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Run `supabase start` and `pnpm --filter mobile test:rls` to run this for real.',
  );
}

maybeDescribe('Soft delete / restore (Doc 01 §1.16.2)', () => {
  let fixtures: SoftDeleteFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  }, 30_000);

  afterAll(async () => {
    if (fixtures) await teardownFixtures(fixtures);
  }, 30_000);

  it('soft_delete_project excludes the project from active_projects but leaves the row in `projects` itself', async () => {
    const client = await asUser(fixtures.owner);
    const projectId = await createProject(
      fixtures.orgId,
      fixtures.owner.userId,
      'Soft Delete Target',
    );

    const { error: deleteErr } = await client.rpc('soft_delete_project', {
      p_project_id: projectId,
    });
    expect(deleteErr).toBeNull();

    const { data: activeRow } = await client
      .from('active_projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();
    expect(activeRow).toBeNull();

    const { data: rawRow, error: rawErr } = await client
      .from('projects')
      .select('id, deleted_at')
      .eq('id', projectId)
      .single();
    expect(rawErr).toBeNull();
    expect(rawRow?.deleted_at).not.toBeNull();
  });

  it('restore_project brings the project back within the 30-day window', async () => {
    const client = await asUser(fixtures.owner);
    const projectId = await createProject(
      fixtures.orgId,
      fixtures.owner.userId,
      'Restore Target — Within Window',
    );

    await client.rpc('soft_delete_project', { p_project_id: projectId });

    const { error: restoreErr } = await client.rpc('restore_project', {
      p_project_id: projectId,
    });
    expect(restoreErr).toBeNull();

    const { data: activeRow, error: activeErr } = await client
      .from('active_projects')
      .select('id, deleted_at')
      .eq('id', projectId)
      .single();
    expect(activeErr).toBeNull();
    expect(activeRow?.deleted_at).toBeNull();
  });

  it('restore_project does NOT restore a project soft-deleted more than 30 days ago', async () => {
    const client = await asUser(fixtures.owner);
    const projectId = await createProject(
      fixtures.orgId,
      fixtures.owner.userId,
      'Restore Target — Outside Window',
    );

    await client.rpc('soft_delete_project', { p_project_id: projectId });
    await backdateDeletedAt(projectId, 34); // 34 days ago — outside restore_project's own 30-day predicate

    const { error: restoreErr } = await client.rpc('restore_project', {
      p_project_id: projectId,
    });
    // The RPC itself doesn't error — its WHERE clause just matches zero
    // rows, so the call "succeeds" but is a no-op. The real assertion is
    // that deleted_at is still set afterward.
    expect(restoreErr).toBeNull();

    const { data: rawRow, error: rawErr } = await client
      .from('projects')
      .select('deleted_at')
      .eq('id', projectId)
      .single();
    expect(rawErr).toBeNull();
    expect(rawRow?.deleted_at).not.toBeNull();
  });

  it('purge_soft_deleted_records removes a project soft-deleted more than 30 days ago', async () => {
    const client = await asUser(fixtures.owner);
    const projectId = await createProject(fixtures.orgId, fixtures.owner.userId, 'Purge Target');

    await client.rpc('soft_delete_project', { p_project_id: projectId });
    await backdateDeletedAt(projectId, 31);

    const { data: purgedCount, error: purgeErr } = await client.rpc('purge_soft_deleted_records');
    expect(purgeErr).toBeNull();
    expect(typeof purgedCount).toBe('number');
    expect(purgedCount as number).toBeGreaterThanOrEqual(1);

    const { data: rawRow, error: rawErr } = await client
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();
    expect(rawErr).toBeNull();
    expect(rawRow).toBeNull(); // the row itself is gone, not just excluded by a view
  });

  it('purge_soft_deleted_records does NOT remove a project soft-deleted less than 30 days ago', async () => {
    const client = await asUser(fixtures.owner);
    const projectId = await createProject(
      fixtures.orgId,
      fixtures.owner.userId,
      'Purge Target — Too Recent',
    );

    await client.rpc('soft_delete_project', { p_project_id: projectId });
    // No backdating — deleted_at stays at "now", well inside the 30-day window.

    await client.rpc('purge_soft_deleted_records');

    const { data: rawRow, error: rawErr } = await client
      .from('projects')
      .select('id, deleted_at')
      .eq('id', projectId)
      .single();
    expect(rawErr).toBeNull();
    expect(rawRow?.deleted_at).not.toBeNull(); // still soft-deleted, not purged
  });
});

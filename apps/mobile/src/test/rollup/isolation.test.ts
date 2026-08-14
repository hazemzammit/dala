import {
  asUser,
  createFixtures,
  hasLocalSupabaseEnv,
  teardownFixtures,
  type RollupFixtures,
} from './fixtures';

/**
 * apps/mobile/src/test/rollup/isolation.test.ts
 *
 * Doc 01 §1.17.1's "no super-owner" constraint / Doc 02 §2.11's cross-org
 * rollup isolation row. See ./fixtures.ts's header for what this suite
 * specifically guards against and why it's not a duplicate of Phase 11's
 * rls/rlsMatrix.test.ts Org C isolation cases: this is a query-shape
 * regression (a filter that spans two org_ids), not a role-shape one.
 *
 * Written and checked against the actual RLS policy
 * (`projects_select_lead_or_trade` → `is_org_member(lead_org_id)`,
 * migration 0006) but NOT executed against a live instance from this
 * session — no Docker/local Supabase available here.
 */

const maybeDescribe = hasLocalSupabaseEnv() ? describe : describe.skip;

if (!hasLocalSupabaseEnv()) {
  // eslint-disable-next-line no-console
  console.warn(
    'Skipping rollup isolation suite: EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Run `supabase start` and `pnpm --filter mobile test:rls` to run this for real.',
  );
}

maybeDescribe('Cross-org rollup isolation — no super-owner (Doc 01 §1.17.1)', () => {
  let fixtures: RollupFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  }, 30_000);

  afterAll(async () => {
    if (fixtures) await teardownFixtures(fixtures);
  }, 30_000);

  it("a single-org-filtered query for Org A returns only Org A's project, never Org B's", async () => {
    const client = await asUser(fixtures.ownerA);
    const { data, error } = await client
      .from('projects')
      .select('id, lead_org_id')
      .eq('lead_org_id', fixtures.orgAId);

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(fixtures.projectAId);
    expect(ids).not.toContain(fixtures.projectBId);
  });

  it('the core regression: a query FILTER spanning both org_ids still returns only rows the account is actually a member of', async () => {
    const client = await asUser(fixtures.ownerA);
    // This is the shape a genuine multi-org rollup query would take for an
    // account that owned BOTH orgs — ownerA does not, so every row from
    // Org B must be absent from the result, not merely "not highlighted"
    // or filtered client-side. If RLS were ever satisfied by "member of AT
    // LEAST ONE org_id in this filter" instead of "member of the org_id ON
    // THIS ROW," this is the assertion that would catch it.
    const { data, error } = await client
      .from('projects')
      .select('id, lead_org_id')
      .in('lead_org_id', [fixtures.orgAId, fixtures.orgBId]);

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(fixtures.projectAId);
    expect(ids).not.toContain(fixtures.projectBId);

    const orgIdsReturned = new Set((data ?? []).map((r) => r.lead_org_id));
    expect(orgIdsReturned.has(fixtures.orgBId)).toBe(false);
  });

  it("a direct, single-row lookup of Org B's project by id returns nothing for an Org-A-only account", async () => {
    const client = await asUser(fixtures.ownerA);
    const { data, error } = await client
      .from('projects')
      .select('id')
      .eq('id', fixtures.projectBId)
      .maybeSingle();

    // RLS filters the row out entirely rather than surfacing a permission
    // error — this codebase's consistent pattern (Doc 01 §1.5): a query
    // for a row you can't see behaves identically to a query for a row
    // that doesn't exist.
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("an unfiltered query still never surfaces Org B's project for an Org-A-only account", async () => {
    const client = await asUser(fixtures.ownerA);
    const { data, error } = await client.from('projects').select('id, lead_org_id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).not.toContain(fixtures.projectBId);
  });
});

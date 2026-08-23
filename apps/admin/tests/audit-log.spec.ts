import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.6 — filterable audit log, six spec-listed dimensions
 * (action, table, actor, org, IP, date range).
 *
 * Admin remediation Tier 2.4 — this file didn't exist before (the second
 * of the two coverage holes the remediation plan flagged). Per the plan:
 * seed a couple of known rows directly (service-role client, same
 * pattern every other direct-DB-seed test in this suite already uses —
 * see organizations.spec.ts's restore test), then assert each filter
 * actually narrows results, not just that the page renders.
 *
 * Two marker rows, deliberately differing on every filterable dimension,
 * so each filter test can assert BOTH "the matching marker is present"
 * AND "the non-matching marker is absent" — a filter that silently did
 * nothing (returned everything) would pass a present-only check but fail
 * this one.
 */
test.describe('Audit log — filters', () => {
  test('each of the six filters narrows results', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const stamp = Date.now();
    const actionA = `e2e-test.audit-filter-marker-a-${stamp}`;
    const actionB = `e2e-test.audit-filter-marker-b-${stamp}`;
    const since = new Date(Date.now() - 1000).toISOString();

    const rowA = {
      actor_id: fixtures.adminA.id,
      actor_type: 'platform_admin',
      action: actionA,
      target_table: 'organizations',
      target_id: fixtures.orgId,
      org_id: fixtures.orgId,
      ip_address: '203.0.113.10', // TEST-NET-3 (RFC 5737) — safe placeholder
    };
    const rowB = {
      actor_id: fixtures.adminB.id,
      actor_type: 'platform_admin',
      action: actionB,
      target_table: 'profiles',
      target_id: fixtures.targetUserId,
      org_id: null,
      ip_address: '203.0.113.20',
    };

    const { error: insertError } = await supabase.from('audit_log').insert([rowA, rowB]);
    expect(insertError).toBeNull();

    try {
      await loginAsAdmin(page, fixtures.adminA);

      const fetchActions = async (query: string): Promise<string[]> => {
        const res = await page.request.get(`/api/admin/audit-log?${query}`);
        const body = await res.json();
        return (body.entries ?? []).map((e: { action: string }) => e.action);
      };

      // 1. action — ilike partial match (api/admin/audit-log/route.ts)
      const byAction = await fetchActions(`action=audit-filter-marker-a-${stamp}`);
      expect(byAction).toContain(actionA);
      expect(byAction).not.toContain(actionB);

      // 2. table (target_table) — exact match; both markers use a
      // different table specifically so this is a real narrowing check,
      // not just "row A happens to be in the result set."
      const byTable = await fetchActions('table=profiles');
      expect(byTable).toContain(actionB);
      expect(byTable).not.toContain(actionA);

      // 3. actorId — exact match
      const byActor = await fetchActions(`actorId=${fixtures.adminB.id}`);
      expect(byActor).toContain(actionB);
      expect(byActor).not.toContain(actionA);

      // 4. orgId — exact match; row B has org_id null, so any real orgId
      // filter excludes it by construction, same as a genuine filter would.
      const byOrg = await fetchActions(`orgId=${fixtures.orgId}`);
      expect(byOrg).toContain(actionA);
      expect(byOrg).not.toContain(actionB);

      // 5. ipAddress — exact match
      const byIp = await fetchActions('ipAddress=203.0.113.10');
      expect(byIp).toContain(actionA);
      expect(byIp).not.toContain(actionB);

      // 6. date range — both markers were just inserted, so a `dateFrom`
      // of "just before insertion" should include both; a `dateFrom` set
      // an hour in the future should include neither.
      const byDateIncluding = await fetchActions(`dateFrom=${since}`);
      expect(byDateIncluding).toContain(actionA);
      expect(byDateIncluding).toContain(actionB);

      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const byDateExcluding = await fetchActions(`dateFrom=${futureDate}`);
      expect(byDateExcluding).not.toContain(actionA);
      expect(byDateExcluding).not.toContain(actionB);
    } finally {
      await supabase.from('audit_log').delete().in('action', [actionA, actionB]);
    }
  });

  test('audit log is reachable by every admin role (read-only)', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      const res = await page.request.get('/api/admin/audit-log');
      expect(res.ok()).toBeTruthy();
    }
  });
});

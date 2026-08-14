import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.5 — Database Explorer. No spec existed for this screen
 * before this remediation phase.
 *
 * execute/route.ts branches on `platform_admins` COUNT(*) >= 2 (not
 * super_admins specifically) to decide direct-execute vs.
 * requires-approval — global-setup.ts always seeds 3 admins (adminA,
 * adminB, adminSupport), so the approval-flow branch is what actually
 * runs by default. To exercise the direct-execute branch too, the last
 * test below temporarily deletes the two non-adminA platform_admins rows
 * around the assertion and restores them in a `finally`, rather than
 * changing global-setup.ts's fixture count (which impersonation.spec.ts
 * and rbac.spec.ts both depend on staying at 3).
 */
test.describe('Database Explorer', () => {
  test('read-only /query path works for support (no role gate)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/db-explorer/query', {
      data: { sql: 'select 1 as ok' },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('/execute rejects a read-only statement', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/db-explorer/execute', {
      data: { sql: 'select 1', dangerZoneConfirmed: true, reason: 'rbac/classification test' },
    });
    expect(res.status()).toBe(400);
  });

  test('write with 2+ admins goes to pending_approval, not direct execution', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/db-explorer/execute', {
      data: {
        sql: `update organizations set updated_at = now() where id = '${fixtures.orgId}'`,
        dangerZoneConfirmed: true,
        reason: 'db-explorer.spec.ts approval-flow branch',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('pending_approval');
    expect(body.approvalRequest?.id).toBeTruthy();

    // The approving admin must be super_admin too (item 1's fix) — adminB
    // is seeded as 'admin', not 'super_admin', so this must 403, proving
    // approval requires the same role direct execution would.
    await loginAsAdmin(page, fixtures.adminB);
    const approveRes = await page.request.post(
      `/api/admin/db-explorer/approvals/${body.approvalRequest.id}`,
      { data: { decision: 'approve' } },
    );
    expect(approveRes.status()).toBe(403);
  });

  test('write with a single remaining admin executes directly', async ({ page }) => {
    const fixtures = loadFixtures();
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // Snapshot the other two admins' full rows so they can be restored
    // exactly, then remove them to bring platform_admins down to 1.
    const { rows: others } = await pool.query(
      'select * from platform_admins where id != (select id from auth.users where email = $1)',
      [fixtures.adminA.email],
    );

    try {
      await pool.query(
        'delete from platform_admins where id != (select id from auth.users where email = $1)',
        [fixtures.adminA.email],
      );

      await loginAsAdmin(page, fixtures.adminA);
      const res = await page.request.post('/api/admin/db-explorer/execute', {
        data: {
          sql: `update organizations set updated_at = now() where id = '${fixtures.orgId}'`,
          dangerZoneConfirmed: true,
          reason: 'db-explorer.spec.ts direct-execute branch (lone admin)',
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.status).toBe('executed');
    } finally {
      // Restore exactly — re-inserting the snapshotted rows, not
      // re-running global-setup.ts's seeding logic, so every column
      // (including the encrypted TOTP secret) comes back byte-identical.
      for (const row of others) {
        const columns = Object.keys(row);
        const values = columns.map((c) => row[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(
          `insert into platform_admins (${columns.join(', ')}) values (${placeholders}) on conflict (id) do nothing`,
          values,
        );
      }
      await pool.end();
    }
  });
});

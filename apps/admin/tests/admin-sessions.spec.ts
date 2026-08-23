import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Admin remediation Tier 4.9 — admin session visibility/management.
 * Covers the self-service/Super-Admin visibility split (the one real
 * piece of business logic here), the revoke permission rule, and
 * captured IP + admin.revoke_session audit logging.
 */
test.describe('Admin sessions', () => {
  test('non-super-admin only sees their own sessions', async ({ page, browser }) => {
    const fixtures = loadFixtures();

    // Two separate browser contexts so adminA and adminB each get their
    // own real session row via a real login, not a fabricated one.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB, fixtures.adminB);
    await contextB.close();

    await loginAsAdmin(page, fixtures.adminA);
    const res = await page.request.get('/api/admin/sessions');
    const { sessions } = await res.json();

    expect(sessions.every((s: { admin_id: string }) => s.admin_id === fixtures.adminA.id)).toBe(
      true,
    );
  });

  test('super_admin sees sessions from other admins too', async ({ page, browser }) => {
    const fixtures = loadFixtures();

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA, fixtures.adminA);
    await contextA.close();

    await loginAsAdmin(page, fixtures.adminSuper);
    const res = await page.request.get('/api/admin/sessions');
    const { sessions } = await res.json();

    const adminIds = new Set(sessions.map((s: { admin_id: string }) => s.admin_id));
    expect(adminIds.has(fixtures.adminSuper.id)).toBe(true);
    expect(adminIds.has(fixtures.adminA.id)).toBe(true);
  });

  test('captures ip_address at login', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/sessions');
    const { sessions } = await res.json();
    const own = sessions.find((s: { is_current: boolean }) => s.is_current);
    expect(own).toBeTruthy();
    expect(own.ip_address).toBeTruthy();
  });

  test('a non-super-admin cannot revoke another admin\u2019s session', async ({
    page,
    browser,
  }) => {
    const fixtures = loadFixtures();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB, fixtures.adminB);
    const sessionsResB = await pageB.request.get('/api/admin/sessions');
    const { sessions: sessionsB } = await sessionsResB.json();
    const adminBSessionId = sessionsB.find((s: { is_current: boolean }) => s.is_current).id;
    await contextB.close();

    await loginAsAdmin(page, fixtures.adminA);
    const res = await page.request.post('/api/admin/sessions', {
      data: { sessionId: adminBSessionId, action: 'revoke' },
    });
    expect(res.status()).toBe(403);
  });

  test('a non-super-admin CAN revoke their own other session', async ({ page, browser }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const contextOther = await browser.newContext();
    const pageOther = await contextOther.newPage();
    await loginAsAdmin(pageOther, fixtures.adminA);
    const otherSessionRes = await pageOther.request.get('/api/admin/sessions');
    const { sessions: otherSessions } = await otherSessionRes.json();
    const otherSessionId = otherSessions.find((s: { is_current: boolean }) => s.is_current).id;
    await contextOther.close();

    await loginAsAdmin(page, fixtures.adminA);
    const res = await page.request.post('/api/admin/sessions', {
      data: { sessionId: otherSessionId, action: 'revoke' },
    });
    expect(res.ok()).toBeTruthy();

    const { data: revoked } = await supabase
      .from('admin_sessions')
      .select('revoked_at')
      .eq('id', otherSessionId)
      .single();
    expect(revoked?.revoked_at).not.toBeNull();
  });

  test('super_admin CAN revoke another admin\u2019s session; logs admin.revoke_session', async ({
    page,
    browser,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const since = new Date().toISOString();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB, fixtures.adminB);
    const sessionsResB = await pageB.request.get('/api/admin/sessions');
    const { sessions: sessionsB } = await sessionsResB.json();
    const adminBSessionId = sessionsB.find((s: { is_current: boolean }) => s.is_current).id;
    await contextB.close();

    await loginAsAdmin(page, fixtures.adminSuper);
    const res = await page.request.post('/api/admin/sessions', {
      data: { sessionId: adminBSessionId, action: 'revoke' },
    });
    expect(res.ok()).toBeTruthy();

    const { data: auditRows } = await supabase
      .from('audit_log')
      .select('action, target_id, metadata')
      .eq('actor_id', fixtures.adminSuper.id)
      .eq('action', 'admin.revoke_session')
      .gte('created_at', since);
    expect(auditRows?.length).toBeGreaterThanOrEqual(1);
    expect(auditRows?.[0].target_id).toBe(adminBSessionId);
    expect((auditRows?.[0].metadata as any)?.selfRevoke).toBe(false);
  });
});

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Admin remediation Tier 4.8 — internal notes / lightweight CRM layer.
 * Covers the full CRUD cycle via the API (create, list, edit, delete),
 * the author-or-super-admin permission rule specifically (the one real
 * piece of business logic in this item), and the new minimal user-detail
 * page's existence.
 */
test.describe('Admin notes — CRUD', () => {
  test('create, list, edit, delete a note on an organization', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const createRes = await page.request.post('/api/admin/notes', {
      data: { targetType: 'org', targetId: fixtures.orgId, body: 'e2e test note — initial' },
    });
    expect(createRes.ok()).toBeTruthy();
    const { note } = await createRes.json();
    expect(note.body).toBe('e2e test note — initial');

    try {
      const listRes = await page.request.get(
        `/api/admin/notes?targetType=org&targetId=${fixtures.orgId}`,
      );
      const { notes } = await listRes.json();
      expect(notes.some((n: { id: string }) => n.id === note.id)).toBe(true);

      const editRes = await page.request.patch(`/api/admin/notes/${note.id}`, {
        data: { body: 'e2e test note — edited' },
      });
      expect(editRes.ok()).toBeTruthy();

      const listAfterEdit = await page.request.get(
        `/api/admin/notes?targetType=org&targetId=${fixtures.orgId}`,
      );
      const { notes: notesAfterEdit } = await listAfterEdit.json();
      const edited = notesAfterEdit.find((n: { id: string }) => n.id === note.id);
      expect(edited.body).toBe('e2e test note — edited');
    } finally {
      const deleteRes = await page.request.delete(`/api/admin/notes/${note.id}`);
      expect(deleteRes.ok()).toBeTruthy();
    }
  });

  test('a different admin (not the author, not super_admin) cannot edit or delete the note', async ({
    page,
  }) => {
    const fixtures = loadFixtures();

    await loginAsAdmin(page, fixtures.adminA);
    const createRes = await page.request.post('/api/admin/notes', {
      data: {
        targetType: 'org',
        targetId: fixtures.orgId,
        body: 'e2e test note — permission check',
      },
    });
    const { note } = await createRes.json();

    try {
      await loginAsAdmin(page, fixtures.adminB);
      const editRes = await page.request.patch(`/api/admin/notes/${note.id}`, {
        data: { body: 'should not be allowed' },
      });
      expect(editRes.status()).toBe(403);

      const deleteRes = await page.request.delete(`/api/admin/notes/${note.id}`);
      expect(deleteRes.status()).toBe(403);
    } finally {
      await loginAsAdmin(page, fixtures.adminA);
      await page.request.delete(`/api/admin/notes/${note.id}`);
    }
  });

  test('super_admin CAN edit/delete a note authored by a different admin', async ({ page }) => {
    const fixtures = loadFixtures();

    await loginAsAdmin(page, fixtures.adminA);
    const createRes = await page.request.post('/api/admin/notes', {
      data: {
        targetType: 'org',
        targetId: fixtures.orgId,
        body: 'e2e test note — super admin override',
      },
    });
    const { note } = await createRes.json();

    await loginAsAdmin(page, fixtures.adminSuper);
    const editRes = await page.request.patch(`/api/admin/notes/${note.id}`, {
      data: { body: 'edited by super admin' },
    });
    expect(editRes.ok()).toBeTruthy();

    const deleteRes = await page.request.delete(`/api/admin/notes/${note.id}`);
    expect(deleteRes.ok()).toBeTruthy();
  });

  test('support can add a note (not a data mutation Support is blocked from)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const createRes = await page.request.post('/api/admin/notes', {
      data: { targetType: 'org', targetId: fixtures.orgId, body: 'e2e test note — from support' },
    });
    expect(createRes.ok()).toBeTruthy();
    const { note } = await createRes.json();

    await page.request.delete(`/api/admin/notes/${note.id}`);
  });

  test('note create/update/delete write audit_log rows', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const since = new Date().toISOString();

    await loginAsAdmin(page, fixtures.adminA);
    const createRes = await page.request.post('/api/admin/notes', {
      data: { targetType: 'org', targetId: fixtures.orgId, body: 'e2e test note — audit check' },
    });
    const { note } = await createRes.json();
    await page.request.patch(`/api/admin/notes/${note.id}`, { data: { body: 'edited' } });
    await page.request.delete(`/api/admin/notes/${note.id}`);

    const { data: auditRows } = await supabase
      .from('audit_log')
      .select('action')
      .eq('actor_id', fixtures.adminA.id)
      .gte('created_at', since)
      .in('action', ['note.create', 'note.update', 'note.delete']);

    const actions = (auditRows ?? []).map((r) => r.action);
    expect(actions).toContain('note.create');
    expect(actions).toContain('note.update');
    expect(actions).toContain('note.delete');
  });
});

test.describe('User detail page', () => {
  test('a user detail page exists and shows the notes panel', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    await page.goto(`/users/${fixtures.targetUserId}`);
    await expect(page.getByText('Notes internes')).toBeVisible();
  });

  test('GET /api/admin/users/[userId] returns name/email/status', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get(`/api/admin/users/${fixtures.targetUserId}`);
    expect(res.ok()).toBeTruthy();
    const { user } = await res.json();
    expect(user.id).toBe(fixtures.targetUserId);
    expect(user.email).toBe(fixtures.targetWorker.email);
  });
});

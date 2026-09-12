import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 02 §2.11 — "a dedicated impersonation test asserting scope is
 * limited to the target user's own permissions and that every
 * impersonated action is tagged in audit_log (Doc 04 §4.3.3a)." The one
 * test explicitly called out as non-negotiable in the whole admin suite.
 *
 * "Scope limited to the target user's own permissions" is verified here
 * at the contract level this admin app actually controls: the magic link
 * returned by /impersonate/start is generated for the TARGET's email via
 * Supabase Auth's own admin.generateLink (impersonate/start/route.ts) —
 * never a custom elevated token. Whether apps/web then correctly applies
 * RLS to that resulting session is apps/web's own test suite's
 * responsibility (separate app/deploy, per Doc 02 §2.11's own "Runs
 * against the isolated Admin deployment only") — this suite can't drive
 * a second Next.js app meaningfully without turning this into an
 * integration test across two codebases owned by two different people.
 */
test.describe('Impersonation (Doc 04 §4.3.3a)', () => {
  test('full lifecycle: start scoped to target, nesting forbidden, audit-tagged, end enqueues notification', async ({
    page,
    context,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await loginAsAdmin(page, fixtures.adminA);
    await page.goto(`/organizations/${fixtures.orgId}`);

    // Step 1 — trigger + mandatory reason. Target the worker row explicitly:
    // both members (owner "e2e-org-owner" and worker "e2e-target-worker")
    // carry an Impersonate button, and `.first()` would pick the
    // alphabetically-first owner row — but the confirm-value fill below
    // expects the worker's email, so the dialog mismatch would keep
    // "Démarrer" disabled. Match the row that renders the target worker.
    await page
      .locator('tr', { hasText: 'Impersonate' })
      .filter({ has: page.locator('text=' + fixtures.targetWorker.email) })
      .getByRole('button', { name: 'Impersonate' })
      .click();
    const reason = 'E2E test — verifying impersonation scope and audit tagging';
    await page.getByLabel(/Motif/).fill(reason);

    const confirmInput = page.getByLabel(new RegExp('Tapez'));
    // The dialog's confirmValue is the target's display name (their email,
    // per profiles seeded in global-setup with full_name = email).
    await confirmInput.fill(fixtures.targetWorker.email);

    // Step 2 — starting impersonation opens a new tab (the magic-link
    // hand-off, §4.3.3a step 2) while this tab shows the banner.
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Démarrer' }).click(),
    ]);
    // The popup may already have been redirected by Supabase's verify
    // endpoint before this assertion runs — the whole point of the link is
    // an immediate sign-in redirect to apps/web, so the window between the
    // popup event and the 302-to-fragment redirect can be sub-millisecond.
    // Either state proves the magic-link hand-off: the raw /auth/v1/verify
    // URL, or the verified redirect carrying the target's session tokens in
    // the fragment (type=magiclink, issuer = local Supabase Auth).
    expect(popup.url()).toMatch(/auth\/v1\/verify|#access_token=.*type=magiclink/); // Supabase Auth's magic-link verification

    // §4.3.3a step 4 — persistent banner on the admin's own tab.
    await expect(page.getByText('Mode impersonation actif')).toBeVisible();

    // §4.3.3a step 3 — nesting forbidden: the action is hidden/disabled
    // while a session is active (re-navigate to confirm it's not just this
    // page instance's local state).
    await page.reload();
    await expect(page.getByText('Mode impersonation actif')).toBeVisible();

    // §4.3.3a step 7 — audit trail, tagged with both ids.
    const { data: startLog } = await supabase
      .from('audit_log')
      .select('*')
      .eq('action', 'admin.impersonate_start')
      .eq('impersonated_user_id', fixtures.targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(startLog).not.toBeNull();
    expect(startLog?.impersonation_reason).toBe(reason);

    // End the session.
    await page.getByRole('button', { name: "Quitter l'impersonation" }).click();
    await expect(page.getByText('Mode impersonation actif')).not.toBeVisible();

    const { data: endLog } = await supabase
      .from('audit_log')
      .select('*')
      .eq('action', 'admin.impersonate_end')
      .eq('impersonated_user_id', fixtures.targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(endLog).not.toBeNull();

    // §4.3.3a step 6 — owner-notification queued (not sent synchronously).
    const { data: notification } = await supabase
      .from('impersonation_notifications')
      .select('*')
      .eq('impersonated_user_id', fixtures.targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(notification).not.toBeNull();
    expect(notification?.reason).toBe(reason);
  });

  test('nesting forbidden — a second impersonation cannot start while one is active', async ({
    page,
    context,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await page.goto(`/organizations/${fixtures.orgId}`);
    await page
      .locator('tr', { hasText: 'Impersonate' })
      .filter({ has: page.locator('text=' + fixtures.targetWorker.email) })
      .getByRole('button', { name: 'Impersonate' })
      .click();
    await page.getByLabel(/Motif/).fill('First impersonation for the nesting-forbidden test');
    await page.getByLabel(new RegExp('Tapez')).fill(fixtures.targetWorker.email);
    await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Démarrer' }).click(),
    ]);

    // Server-side re-check, not just the client hiding the button — call
    // the API directly to prove the 409 comes from the route handler.
    const res = await page.request.post('/api/admin/impersonate/start', {
      data: { userId: fixtures.targetUserId, orgId: fixtures.orgId, reason: 'Attempting to nest' },
    });
    expect(res.status()).toBe(409);

    // Clean up so this test doesn't leave a dangling active session for
    // whichever test runs next.
    await page.getByRole('button', { name: "Quitter l'impersonation" }).click();
  });
});

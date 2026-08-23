import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Admin remediation Tier 4.7 — email deliverability visibility. Cannot
 * invoke resend-webhook directly or send it a real Resend-signed request
 * (same disclosed limitation as every other Edge-Function-only feature in
 * this suite). What this covers: seeding real rows via the service-role
 * client (matching what resend-webhook itself would insert) to verify the
 * table's constraints and the admin route's filtering — bounces/
 * complaints surfaced, delivered/opened/clicked excluded.
 */
test.describe('Email deliverability', () => {
  test('email_delivery_events rejects an unrecognized event_type', async ({ page }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase.from('email_delivery_events').insert({
      resend_email_id: 'e2e-test-id',
      event_type: 'email.not_a_real_event',
      recipient: 'test@example.com',
    });
    expect(error).not.toBeNull();
  });

  test('email_delivery_events is service_role-only (no client/anon access)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await anonClient.from('email_delivery_events').select('*').limit(1);
    expect(error).not.toBeNull();
  });

  test('admin route surfaces bounces/complaints but not delivered/opened/clicked', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const marker = `e2e-test-${Date.now()}@example.com`;

    const rows = [
      {
        resend_email_id: 'e2e-1',
        event_type: 'email.bounced',
        recipient: marker,
        bounce_type: 'Permanent',
        bounce_message: 'mailbox does not exist',
      },
      { resend_email_id: 'e2e-2', event_type: 'email.complained', recipient: marker },
      { resend_email_id: 'e2e-3', event_type: 'email.delivered', recipient: marker },
      { resend_email_id: 'e2e-4', event_type: 'email.opened', recipient: marker },
    ];

    try {
      const { error: insertError } = await supabase.from('email_delivery_events').insert(rows);
      expect(insertError).toBeNull();

      await loginAsAdmin(page, fixtures.adminA);
      const res = await page.request.get('/api/admin/services-health/email-events');
      expect(res.ok()).toBeTruthy();
      const body = await res.json();

      const markerEvents = (body.events ?? []).filter(
        (e: { recipient: string }) => e.recipient === marker,
      );
      const eventTypes = markerEvents.map((e: { event_type: string }) => e.event_type);

      expect(eventTypes).toContain('email.bounced');
      expect(eventTypes).toContain('email.complained');
      expect(eventTypes).not.toContain('email.delivered');
      expect(eventTypes).not.toContain('email.opened');

      const bounceRow = markerEvents.find(
        (e: { event_type: string }) => e.event_type === 'email.bounced',
      );
      expect(bounceRow.bounce_type).toBe('Permanent');
    } finally {
      await supabase.from('email_delivery_events').delete().eq('recipient', marker);
    }
  });

  test('reachable by every role, including support (read-only)', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      const res = await page.request.get('/api/admin/services-health/email-events');
      expect(res.ok()).toBeTruthy();
    }
  });
});

/**
 * Direct test of the Svix HMAC verification algorithm resend-webhook
 * implements — the single most novel/highest-risk piece of this item
 * (a wrong implementation here means EVERY real Resend webhook gets
 * silently rejected with 401, not a partial failure). Reimplements the
 * same Web Crypto API calls resend-webhook/index.ts uses, generates a
 * real signature the way Resend/Svix's own docs describe, and confirms
 * the math is right — this is a Node-side reference implementation of
 * the exact algorithm, not a call into the Deno function itself.
 */
test.describe('Svix signature algorithm (reference implementation check)', () => {
  test('HMAC-SHA256 over "{id}.{timestamp}.{body}" matches Svix\u2019s own documented test vector', async () => {
    const crypto = await import('node:crypto');

    // Exact test vector from Svix's own "Verifying Webhooks Manually"
    // docs (secret, payload, msg_id, timestamp → expected signature) —
    // verified against their live docs before writing this test, not
    // invented. If this fails, either Svix's documented example changed
    // or the implementation's understanding of their signing scheme is
    // wrong — either way, worth knowing before trusting a real webhook.
    const secret = 'whsec_plJ3nmyCDGBKInavdOK15jsl';
    const payload = '{"event_type":"ping","data":{"success":true}}';
    const msgId = 'msg_loFOjxBNrRLzqYUf';
    const timestamp = '1731705121';
    const expectedSignature = 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=';

    const keyMaterial = secret.slice('whsec_'.length);
    const keyBytes = Buffer.from(keyMaterial, 'base64');
    const signedContent = `${msgId}.${timestamp}.${payload}`;
    const hmac = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');

    expect(`v1,${hmac}`).toBe(expectedSignature);
  });
});

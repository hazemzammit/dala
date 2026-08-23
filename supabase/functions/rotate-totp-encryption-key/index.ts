// supabase/functions/rotate-totp-encryption-key/index.ts
//
// Doc 00 §0.5 item 8 (CIN's rotation design, the pattern this borrows —
// see migration 0061's header for why there's no existing key_rotation_log
// table to mirror instead). Admin remediation Tier 2.7 — makes 0023's
// "rotatable... without a data migration" design actually rotate on a
// schedule (180-day cadence, see 0061's header for why 180 rather than
// CIN's 90 — a deliberate choice for this lower-blast-radius key, not a
// copied default).
//
// ALGORITHM MUST STAY IN SYNC with apps/admin/src/lib/crypto/
// totp-secret-core.ts: AES-256-GCM, format
// "{version}.{ivBase64}.{authTagBase64}.{ciphertextBase64}". Duplicated
// here rather than shared (this is a separate Deno runtime from the
// Next.js app, no straightforward way to share the file directly) — if
// that algorithm or format ever changes, this function needs the same
// change made here too, or a rotation would write ciphertext the admin
// app can no longer decrypt.
//
// ORDERING (the part the plan flagged as needing extra care — "don't lose
// access to any admin's 2FA mid-rotation"):
//   1. Generate new key material, store in Vault under a new version name.
//   2. Re-encrypt EVERY platform_admins.totp_secret row with the new key,
//      one at a time, tracking success count.
//   3. Only if every row succeeded: flip totp_encryption_key_state's
//      current_version to the new version (0061, Part 1) — this is what
//      makes NEW encryptions (admin.reset_totp, first-login TOTP setup)
//      use the new key going forward.
//   4. Never delete the old Vault key automatically — flagged in this
//      run's log row for manual removal once you're confident the
//      rotation succeeded, same caution the plan asked for.
// If step 2 fails partway, the run is marked 'failed' and step 3 never
// runs — every existing admin's stored ciphertext is untouched wherever
// re-encryption didn't reach it (still tagged with, and decryptable via,
// the OLD version, which stays live in Vault), and current_version stays
// on the old version, so no admin is ever locked out by an incomplete run.
//
// SKIP-IF-RECENT: 0061's cron expression runs twice a year on a fixed
// calendar schedule (1 Jan / 1 Jul), which is a reasonable approximation
// of "every 180 days" but not exact. This function is the real gate:  it
// checks the last successful rotation's completed_at and skips (no-op,
// no log row written) if that was under 150 days ago — a manually
// triggered extra invocation, or a cron misfire, can never over-rotate.
// SERVICES HEALTH INTEGRATION: also writes to the shared `scheduled_job_runs`
// table (job_name = 'totp_key_rotation'), same convention every other
// cron job in this repo follows (0026/0027/0030/0053/0057) — this is what
// lets services-health/route.ts's MONITORED_JOBS list surface a failed
// rotation the same way it surfaces any other job failure (the plan's
// step 3). `totp_key_rotation_log` is a SEPARATE, additional table, not a
// replacement — it carries structured detail (old/new version, exact
// admin count re-encrypted) that scheduled_job_runs' generic shape has no
// room for and that matters enough for a security-key rotation to keep on
// its own record.
import crypto from 'node:crypto';

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const JOB_NAME = 'totp_key_rotation';
const ALGORITHM = 'aes-256-gcm';
const MIN_DAYS_BETWEEN_ROTATIONS = 150; // under the 180-day cadence, see header

function nextVersion(current: string): string {
  const match = current.match(/^v(\d+)$/);
  const n = match ? parseInt(match[1], 10) : 0;
  return `v${n + 1}`;
}

function encrypt(plaintext: string, key: Buffer, version: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    version,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

function decrypt(stored: string, key: Buffer): string {
  const parts = stored.split('.');
  if (parts.length !== 4) throw new Error('Malformed encrypted TOTP secret.');
  const [, ivB64, tagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64!, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

Deno.serve(async (_req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // --- skip-if-recent gate ---
  const { data: lastSuccess } = await admin
    .from('totp_key_rotation_log')
    .select('completed_at')
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSuccess?.completed_at) {
    const daysSince =
      (Date.now() - new Date(lastSuccess.completed_at as string).getTime()) / 86_400_000;
    if (daysSince < MIN_DAYS_BETWEEN_ROTATIONS) {
      // Still log a lightweight scheduled_job_runs row even on skip — this
      // is what keeps the Services Health page's "last run" timestamp
      // fresh, showing the cron tick itself is firing and the skip logic
      // is working, rather than looking like a job that stopped running
      // months ago. totp_key_rotation_log is NOT touched on skip — a
      // no-op isn't a rotation attempt worth a detail row there.
      await admin
        .from('scheduled_job_runs')
        .insert({ job_name: JOB_NAME, status: 'success', completed_at: new Date().toISOString() });
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: `last rotation was ${Math.round(daysSince)} days ago`,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  const { data: oldVersion } = await admin.rpc('admin_get_current_totp_key_version');
  const newVersion = nextVersion(oldVersion as string);

  const { data: jobRun } = await admin
    .from('scheduled_job_runs')
    .insert({ job_name: JOB_NAME })
    .select('id')
    .single();

  const { data: admins, error: adminsError } = await admin
    .from('platform_admins')
    .select('id, totp_secret')
    .not('totp_secret', 'is', null);
  if (adminsError) {
    await admin
      .from('scheduled_job_runs')
      .update({
        status: 'failed',
        error_message: adminsError.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobRun?.id);
    return new Response(JSON.stringify({ error: adminsError.message }), { status: 500 });
  }

  const { data: logRow } = await admin
    .from('totp_key_rotation_log')
    .insert({
      old_key_version: oldVersion,
      new_key_version: newVersion,
      status: 'running',
      admins_total: admins?.length ?? 0,
      admins_reencrypted: 0,
    })
    .select('id')
    .single();

  try {
    // 1. New key material, new Vault entry.
    const newKeyBase64 = crypto.randomBytes(32).toString('base64'); // AES-256 = 32 bytes
    const { error: vaultError } = await admin.rpc('admin_create_totp_encryption_key_vault_secret', {
      p_new_version: newVersion,
      p_key_base64: newKeyBase64,
    });
    if (vaultError) throw new Error(`Vault write failed: ${vaultError.message}`);

    const { data: oldKeyRow } = await admin.rpc('admin_get_totp_encryption_key', {
      key_version: oldVersion,
    });
    const oldKey = Buffer.from(oldKeyRow as string, 'base64');
    const newKey = Buffer.from(newKeyBase64, 'base64');

    // 2. Re-encrypt every admin's stored secret, one at a time.
    let reencrypted = 0;
    for (const row of admins ?? []) {
      const plaintext = decrypt(row.totp_secret as string, oldKey);
      const reencryptedValue = encrypt(plaintext, newKey, newVersion);
      const { error: updateError } = await admin
        .from('platform_admins')
        .update({ totp_secret: reencryptedValue })
        .eq('id', row.id);
      if (updateError)
        throw new Error(
          `Failed writing re-encrypted secret for admin ${row.id}: ${updateError.message}`,
        );
      reencrypted += 1;
    }

    // 3. Only now — every row succeeded — flip current_version for new writes.
    const { error: flipError } = await admin.rpc('admin_set_current_totp_key_version', {
      p_new_version: newVersion,
    });
    if (flipError) throw new Error(`Failed flipping current_version: ${flipError.message}`);

    await admin
      .from('totp_key_rotation_log')
      .update({
        status: 'success',
        admins_reencrypted: reencrypted,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logRow?.id);

    await admin
      .from('scheduled_job_runs')
      .update({ status: 'success', completed_at: new Date().toISOString() })
      .eq('id', jobRun?.id);

    // 4. Old key is intentionally left in Vault — not deleted here. Flag
    // for manual removal once you've confirmed this rotation is good.
    return new Response(
      JSON.stringify({
        ok: true,
        oldVersion,
        newVersion,
        adminsReencrypted: reencrypted,
        note: `Old key "admin_totp_encryption_key_${oldVersion}" was left in Vault — remove manually once confirmed.`,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue.';
    await admin
      .from('totp_key_rotation_log')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', logRow?.id);
    await admin
      .from('scheduled_job_runs')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', jobRun?.id);

    console.error(
      '[rotate-totp-encryption-key] rotation failed, current_version left unchanged:',
      message,
    );
    return new Response(JSON.stringify({ error: 'Échec de la rotation.', detail: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

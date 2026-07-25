/**
 * One-time bootstrap: creates the very first Super Admin account.
 * After this, use the "Inviter un admin" form on /admin-users (Doc 04
 * §4.3.11) — this script exists only because that screen needs an existing
 * Super Admin to use it, a bootstrap problem every admin panel has.
 *
 * Usage (from apps/admin/):
 *   pnpm create-admin -- --email you@dala.tn --name "Your Name" --password "temp-password"
 *
 * The password is a normal Supabase Auth password — the admin logs in with
 * it via step 1, then is forced into TOTP setup on first login (§4.3.1),
 * same as any other invited admin.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

// `next dev`/`next build` auto-load .env.local via next/env — a standalone
// tsx script gets none of that for free, so process.env would otherwise be
// empty even with real values sitting in the file. Load it explicitly,
// resolved relative to this script (not the shell's cwd), so `pnpm
// create-admin` works the same whether run from apps/admin/ or the repo
// root via `pnpm --filter admin create-admin`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../.env.local') });

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const email = arg('email');
  const name = arg('name');
  const password = arg('password');

  if (!email || !name || !password) {
    console.error(
      'Usage: pnpm create-admin -- --email you@dala.tn --name "Your Name" --password "temp-password"',
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.',
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    console.error('Failed to create auth user:', createError?.message);
    process.exit(1);
  }

  const { error: insertError } = await supabase.from('platform_admins').insert({
    id: created.user.id,
    full_name: name,
    role: 'super_admin',
    totp_enabled: false,
  });

  if (insertError) {
    console.error('Failed to insert platform_admins row:', insertError.message);
    process.exit(1);
  }

  console.log(`Super Admin created: ${email}`);
  console.log(
    'Log in at /login with that email/password — you will be routed into TOTP setup automatically.',
  );
}

main();

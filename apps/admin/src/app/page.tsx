/**
 * Doc 04 §4.3.1 — Admin Login. Auth here is intentionally NOT the same
 * email+password flow as the contractor apps: magic link + mandatory TOTP
 * + IP allowlist (Doc 01 §1.3.10), 2-hour session expiry. Build this as its
 * own flow — do not reuse apps/web's login screen or Supabase client
 * config as-is.
 */
export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="rounded-card border border-neutral-200 bg-neutral-0 p-8">
        <h1 className="font-display text-xl font-semibold">Dala Admin</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Magic link + TOTP login — implement per Doc 01 §1.3.10 / Doc 04 §4.3.1.
        </p>
      </div>
    </main>
  );
}

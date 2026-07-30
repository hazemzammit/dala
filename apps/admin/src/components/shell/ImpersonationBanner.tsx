'use client';

import { WarningIcon } from '@phosphor-icons/react';

import { useAdminSession } from '@/lib/use-admin-session';

/**
 * apps/admin/src/components/shell/ImpersonationBanner.tsx
 *
 * Doc 05 §3.6 — "a persistent 'impersonation session' banner rendered in
 * danger-tinted background whenever active so an admin can never forget
 * they're inside a live impersonation." Doc 04 §4.3.3a step 4 — same
 * requirement, non-dismissable, every screen. Rendered unconditionally in
 * (admin)/layout.tsx so it's structurally impossible to view a page while
 * impersonating without it.
 */
export function ImpersonationBanner() {
  const { data, refresh } = useAdminSession(10_000);

  if (!data?.session.impersonating_user_id) return null;

  async function endImpersonation() {
    await fetch('/api/admin/impersonate/end', { method: 'POST' });
    await refresh();
    window.location.reload();
  }

  return (
    <div className="bg-danger flex items-center justify-between gap-4 px-6 py-2.5 text-sm font-medium text-white">
      <span className="flex items-center gap-2">
        <WarningIcon size={16} weight="fill" />
        {'Mode impersonation actif — '}
        {data.admin.full_name}
        {' · Motif : '}
        {data.session.impersonation_reason}
      </span>
      <button
        onClick={endImpersonation}
        className="rounded-control border border-white/40 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
      >
        Quitter l'impersonation
      </button>
    </div>
  );
}

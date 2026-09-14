'use client';

import { SignOutIcon } from '@phosphor-icons/react';

import { GlobalSearch } from './GlobalSearch';

import { useAdminSession } from '@/lib/use-admin-session';

/**
 * apps/admin/src/components/shell/Topbar.tsx
 *
 * Premium-polish pass (pre-Phase-5 cleanup) — this component and
 * GlobalSearch already existed and worked, but were never rendered in
 * (admin)/layout.tsx (flagged as a known, deliberately-deferred gap in
 * the original overhaul plan §0.8). Every reference screenshot in this
 * pass has a topbar, so it's wired in now as an explicit scope addition
 * — not a silent bundle-in. Restyled to match the rest of this pass'
 * control language (real resting surfaces, sidebar-matching avatar chip)
 * rather than the old plain-border/plain-text bar.
 *
 * No functional change: same session data, same logout call, same
 * GlobalSearch component/behavior underneath.
 */

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  support: 'Support',
};

export function Topbar() {
  const { data } = useAdminSession();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="bg-neutral-0 flex h-[72px] shrink-0 items-center justify-between border-b border-neutral-100 px-8">
      <GlobalSearch />

      <div className="flex items-center gap-3">
        {data && (
          <div className="flex items-center gap-2.5 pr-1">
            <div className="rounded-control bg-accent-100 text-accent-700 flex h-10 w-10 shrink-0 items-center justify-center text-xs font-semibold">
              {data.admin.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-medium text-neutral-900">{data.admin.full_name}</p>
              <p className="text-xs text-neutral-500">
                {ROLE_LABELS[data.admin.role] ?? data.admin.role}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className="hover:border-danger/30 hover:bg-danger/10 hover:text-danger bg-neutral-0 focus-visible:ring-accent-600 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 shadow-[0_1px_2px_rgba(17,19,24,0.05)] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-offset-1 motion-safe:transition-all motion-safe:duration-150"
        >
          <SignOutIcon size={17} aria-hidden="true" />
          <span className="sr-only">Se déconnecter</span>
        </button>
      </div>
    </header>
  );
}

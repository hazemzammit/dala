'use client';

import { GlobalSearch } from './GlobalSearch';

import { useAdminSession } from '@/lib/use-admin-session';

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
    <header className="bg-neutral-0 flex items-center justify-between border-b border-neutral-200 px-6 py-3">
      <GlobalSearch />
      <div className="flex items-center gap-4">
        {data && (
          <span className="text-sm text-neutral-500">
            {data.admin.full_name} · {ROLE_LABELS[data.admin.role] ?? data.admin.role}
          </span>
        )}
        <button
          onClick={logout}
          className="rounded-control hover:bg-neutral-25 border border-neutral-200 px-3 py-1.5 text-sm text-neutral-900"
        >
          Se déconnecter
        </button>
      </div>
    </header>
  );
}

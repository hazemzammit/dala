'use client';

import {
  BuildingsIcon,
  ClipboardTextIcon,
  DatabaseIcon,
  GaugeIcon,
  HardDrivesIcon,
  MegaphoneIcon,
  PulseIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAdminSession } from '@/lib/use-admin-session';

/**
 * apps/admin/src/components/shell/Sidebar.tsx
 *
 * Mirrors apps/web's Sidebar/NavItem visual pattern exactly (active =
 * accent-50 filled pill + fill-weight icon + accent-600 text; inactive =
 * outline icon + neutral-500 text) — Doc 05 §3.6: same components/tokens
 * as the contractor app, denser and tables-first rather than a different
 * visual language. No org switcher (nothing to switch between here);
 * "Dala Admin" wordmark takes that slot instead.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Métriques', icon: GaugeIcon },
  { href: '/organizations', label: 'Organisations', icon: BuildingsIcon },
  { href: '/users', label: 'Utilisateurs', icon: UsersThreeIcon },
  { href: '/db-explorer', label: 'Database Explorer', icon: DatabaseIcon },
  { href: '/audit-log', label: "Journal d'audit", icon: ClipboardTextIcon },
  { href: '/billing', label: 'Facturation', icon: ReceiptIcon },
  { href: '/storage', label: 'Stockage', icon: HardDrivesIcon },
  { href: '/services-health', label: 'Santé des services', icon: PulseIcon },
  { href: '/announcements', label: 'Annonces', icon: MegaphoneIcon },
  { href: '/admin-users', label: 'Gestion des admins', icon: ShieldCheckIcon },
] as const;

function AdminNavItem({ href, label, icon: IconComponent }: (typeof NAV_ITEMS)[number]) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        'rounded-control flex items-center gap-3 px-3 py-2 text-[15.5px] transition-colors duration-150',
        isActive
          ? 'bg-accent-50 text-accent-600 font-medium'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
      ].join(' ')}
    >
      <IconComponent size={19} weight={isActive ? 'fill' : 'regular'} />
      <span className="flex-1">{label}</span>
    </Link>
  );
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  support: 'Support',
};

export function Sidebar() {
  const { data } = useAdminSession();

  async function handleSignOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <aside className="bg-neutral-0 flex h-screen w-[240px] shrink-0 flex-col border-e border-neutral-100">
      {/* Wordmark — takes the org-switcher's slot in the contractor sidebar */}
      <div className="flex items-center gap-2.5 border-b border-neutral-100 px-4 py-4">
        <div className="rounded-control bg-accent-600 flex h-8 w-8 items-center justify-center text-sm font-semibold text-white">
          D
        </div>
        <span className="font-display text-sm font-semibold text-neutral-900">Dala Admin</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <AdminNavItem key={item.href} {...item} />
          ))}
        </div>
      </nav>

      <div className="flex items-center gap-2.5 border-t border-neutral-100 px-4 py-3">
        <div className="rounded-control bg-accent-100 text-accent-700 flex h-8 w-8 items-center justify-center text-xs font-semibold">
          {(data?.admin.full_name ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 truncate">
          <p className="truncate text-sm font-medium text-neutral-900">
            {data?.admin.full_name ?? '…'}
          </p>
          {data && (
            <p className="truncate text-xs text-neutral-500">
              {ROLE_LABELS[data.admin.role] ?? data.admin.role}
            </p>
          )}
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Déconnexion"
          className="hover:text-danger text-neutral-500"
        >
          <SignOutIcon size={18} />
        </button>
      </div>
    </aside>
  );
}

'use client';

import {
  BuildingsIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClipboardTextIcon,
  DatabaseIcon,
  DeviceMobileIcon,
  FlagIcon,
  GaugeIcon,
  HardDrivesIcon,
  MegaphoneIcon,
  MonitorIcon,
  PulseIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAdminSession } from '@/lib/use-admin-session';

/**
 * apps/admin/src/components/shell/Sidebar.tsx
 *
 * Mirrors apps/web's Sidebar/NavItem visual pattern exactly (active =
 * accent-50 filled pill + fill-weight icon + accent-600 text; inactive =
 * outline icon + neutral-500 text) — Doc 05 §3.6: same components/tokens
 * as the contractor app, denser and tables-first rather than a different
 * visual language. No org switcher (nothing to switch between here);
 * real logo takes that slot.
 *
 * Phase 2 — collapsible, persisted in localStorage, grouping the items
 * into sections.
 */
const NAV_GROUPS = [
  {
    label: "Vue d'ensemble",
    items: [{ href: '/dashboard', label: 'Métriques', icon: GaugeIcon }],
  },
  {
    label: 'Gestion',
    items: [
      { href: '/organizations', label: 'Organisations', icon: BuildingsIcon },
      { href: '/users', label: 'Utilisateurs', icon: UsersThreeIcon },
      { href: '/billing', label: 'Facturation', icon: ReceiptIcon },
      { href: '/storage', label: 'Stockage', icon: HardDrivesIcon },
    ],
  },
  {
    label: 'Système',
    items: [
      { href: '/services-health', label: 'Santé des services', icon: PulseIcon },
      { href: '/app-versions', label: "Versions de l'app", icon: DeviceMobileIcon },
      { href: '/feature-flags', label: 'Feature flags', icon: FlagIcon },
      { href: '/announcements', label: 'Annonces', icon: MegaphoneIcon },
    ],
  },
  {
    label: 'Sécurité',
    items: [
      { href: '/audit-log', label: "Journal d'audit", icon: ClipboardTextIcon },
      { href: '/db-explorer', label: 'Database Explorer', icon: DatabaseIcon },
      { href: '/admin-users', label: 'Gestion des admins', icon: ShieldCheckIcon },
      { href: '/admin-sessions', label: 'Sessions admin', icon: MonitorIcon },
    ],
  },
] as const;

type NavItem = (typeof NAV_GROUPS)[number]['items'][number];

function AdminNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
  const IconComponent = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={[
        'rounded-control flex items-center transition-colors duration-150',
        collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2 text-[15.5px]',
        isActive
          ? 'bg-accent-50 text-accent-600 font-medium'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
      ].join(' ')}
    >
      <IconComponent size={19} weight={isActive ? 'fill' : 'regular'} />
      <span className={collapsed ? 'sr-only' : 'flex-1'}>{item.label}</span>
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
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('dala-admin-sidebar-collapsed');
      if (stored === '1') setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem('dala-admin-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed, mounted]);

  async function handleSignOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  // Prevent flash of wrong width on hydration
  const widthClass = !mounted ? 'w-[240px]' : collapsed ? 'w-[76px]' : 'w-[240px]';

  return (
    <aside
      className={`bg-neutral-0 flex h-screen shrink-0 flex-col border-e border-neutral-100 transition-[width] duration-200 ease-in-out ${widthClass}`}
    >
      {/* Header — Real logo */}
      <div className="relative flex h-[72px] items-center justify-between border-b border-neutral-100 px-4">
        {collapsed ? (
          <div className="mx-auto flex w-full items-center justify-center">
            <Image
              src="/logo-mark.png"
              alt="Dala"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          </div>
        ) : (
          <Image
            src="/logo-full.png"
            alt="Dala Admin"
            width={120}
            height={40}
            className="h-10 w-auto object-contain"
          />
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 ${
            collapsed
              ? 'absolute right-[-12px] top-1/2 -translate-y-1/2 rounded-full border border-neutral-200 bg-white shadow-sm'
              : ''
          }`}
          style={collapsed ? { zIndex: 10 } : {}}
        >
          {collapsed ? <CaretRightIcon size={14} weight="bold" /> : <CaretLeftIcon size={16} />}
        </button>
      </div>

      {/* Nav items grouped */}
      <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        <div className="flex flex-col gap-6">
          {NAV_GROUPS.map((group, i) => (
            <div key={i} className="flex flex-col gap-1">
              {collapsed ? (
                <div className="mx-auto mb-2 mt-1 h-px w-6 bg-neutral-200" aria-hidden="true" />
              ) : (
                <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                  {group.label}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <AdminNavItem key={item.href} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div
        className={`flex items-center border-t border-neutral-100 py-3 ${
          collapsed ? 'flex-col justify-center gap-3 px-2' : 'justify-between gap-2.5 px-4'
        }`}
      >
        <div
          className="rounded-control bg-accent-100 text-accent-700 flex h-8 w-8 shrink-0 items-center justify-center text-xs font-semibold"
          title={collapsed ? data?.admin.full_name : undefined}
        >
          {(data?.admin.full_name ?? '?').charAt(0).toUpperCase()}
        </div>

        {!collapsed && (
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
        )}

        <button
          onClick={handleSignOut}
          aria-label="Déconnexion"
          title="Déconnexion"
          className={`hover:text-danger shrink-0 text-neutral-500 ${
            collapsed
              ? 'flex h-8 w-8 items-center justify-center rounded-lg hover:bg-neutral-100'
              : ''
          }`}
        >
          <SignOutIcon size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

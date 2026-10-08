'use client';

import { Avatar } from '@dala/ui-web';
import {
  BuildingsIcon,
  CarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChartBarIcon,
  GaugeIcon,
  GearIcon,
  HardHatIcon,
  HandshakeIcon,
  ImageIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldWarningIcon,
  SignOutIcon,
  TruckIcon,
  UsersThreeIcon,
  WalletIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import logoMark from '../../../assets/logo-mark.png';
import logo from '../../../assets/logo.png';

import { OrgSwitcher } from './OrgSwitcher';

import { NavItem } from '@/components/ui/NavItem';
import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/components/shell/Sidebar.tsx
 *
 * Doc 04 §4.2.1 — persistent left sidebar: brand + org switcher at top,
 * grouped nav list, account row at the bottom.
 *
 * Web shell consistency pass, Step L — brought in line with
 * apps/admin/src/components/shell/Sidebar.tsx's structural pattern:
 * grouped nav (was one flat 14-item list), collapsible width persisted to
 * localStorage (was fixed w-[260px] always), and real Dala branding (was
 * only the org's initial-letter avatar chip, no product mark anywhere).
 *
 * One deliberate difference from admin's version, not an oversight: admin
 * has nothing to switch between, so its header is logo-only. Web's org
 * switcher is real, load-bearing UI (not yet wired to the actual dropdown
 * — see TODO below, unchanged from before this pass), so the header keeps
 * both: brand row on top, org switcher row under it.
 *
 * assets/logo-mark.png is a square icon-only crop of the wordmark
 * (assets/logo.png is 2:1 and illegible squeezed into the 76px collapsed
 * rail), generated once from the same artwork so collapsed and expanded
 * states show the same mark instead of the collapsed rail going blank.
 *
 * TODO before this is done: the org switcher below is a static display of
 * the active org, not yet the real dropdown (Doc 04 §4.2.1's "same grouped
 * list and 'Create organization' flow as Doc 03 §3.22.2a" — Mes
 * entreprises / Autres organisations grouping). Wiring that up needs the
 * org-membership list query, which is Track B work, not this shell pass.
 */
const NAV_GROUPS = [
  {
    label: "Vue d'ensemble",
    items: [{ href: '/dashboard', label: 'Tableau de bord', icon: GaugeIcon }],
  },
  {
    label: 'Chantiers',
    items: [
      { href: '/projects', label: 'Chantiers', icon: BuildingsIcon },
      { href: '/dispatch', label: 'Dispatch', icon: TruckIcon },
      { href: '/vehicles', label: 'Véhicules', icon: CarIcon },
      { href: '/team', label: 'Équipe', icon: HardHatIcon },
    ],
  },
  {
    label: 'Ressources',
    items: [
      { href: '/materials', label: 'Matériaux', icon: PackageIcon },
      { href: '/journal', label: 'Journal', icon: ImageIcon },
      { href: '/safety', label: 'Sécurité', icon: ShieldWarningIcon },
    ],
  },
  {
    label: 'Paie & facturation',
    items: [
      { href: '/advances', label: 'Avances', icon: WalletIcon },
      { href: '/billing', label: 'Facturation', icon: ReceiptIcon },
    ],
  },
  {
    label: 'Relations',
    items: [
      { href: '/client-portal', label: 'Portail client', icon: HandshakeIcon },
      { href: '/collaboration', label: 'Collaboration', icon: UsersThreeIcon },
      { href: '/reports', label: 'Rapports', icon: ChartBarIcon },
    ],
  },
  {
    label: 'Système',
    items: [{ href: '/settings', label: 'Paramètres', icon: GearIcon }],
  },
] as const;

/** Money screens, hidden from viewers (Observateur) — see migration 0103. */
const MONEY_HREFS: ReadonlySet<string> = new Set(['/advances', '/billing', '/reports']);

interface SidebarProps {
  organizationName: string;
  userName: string;
  userAvatarUrl?: string;
  userId: string;
  activeOrgId: string;
  /** False for viewers (money-blind, migration 0103): hides Avances / Facturation / Rapports. */
  showMoney?: boolean;
}

export function Sidebar({
  organizationName,
  userName,
  userAvatarUrl,
  userId,
  activeOrgId,
  showMoney = true,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => showMoney || !MONEY_HREFS.has(item.href)),
  })).filter((group) => group.items.length > 0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('dala-web-sidebar-collapsed');
      if (stored === '1') setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem('dala-web-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed, mounted]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  // Prevent flash of wrong width on hydration
  const widthClass = !mounted ? 'w-[260px]' : collapsed ? 'w-[76px]' : 'w-[260px]';

  return (
    <aside
      className={`bg-neutral-0 flex h-screen shrink-0 flex-col border-e border-neutral-100 transition-[width] duration-200 ease-in-out ${widthClass}`}
    >
      {/* Header — brand row + collapse toggle */}
      <div
        className={`relative flex h-14 items-center border-b border-neutral-100 ${collapsed ? 'justify-center px-2' : 'px-4'}`}
      >
        {collapsed ? (
          <Image src={logoMark} alt="Dala" className="h-9 w-9 object-contain" priority />
        ) : (
          <Image src={logo} alt="Dala" className="h-9 w-auto object-contain" priority />
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          className="bg-neutral-0 hover:border-accent-200 hover:text-accent-700 absolute right-[-14px] top-[26px] z-10 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 shadow-[0_2px_6px_rgba(17,19,24,0.10)] transition-colors"
        >
          {collapsed ? (
            <CaretRightIcon size={13} weight="bold" />
          ) : (
            <CaretLeftIcon size={13} weight="bold" />
          )}
        </button>
      </div>

      {/* Org switcher */}
      <OrgSwitcher
        userId={userId}
        activeOrgId={activeOrgId}
        activeOrgName={organizationName}
        collapsed={collapsed}
      />

      {/* Nav list, grouped */}
      <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        <div className="flex flex-col">
          {visibleGroups.map((group, i) => (
            <div key={group.label} className={`flex flex-col gap-1 ${i > 0 ? 'mt-6' : ''}`}>
              {collapsed ? (
                <div className="mx-auto mb-2 mt-1 h-px w-6 bg-neutral-200" aria-hidden="true" />
              ) : (
                <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                  {group.label}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.href} {...item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Account row */}
      <div
        className={`flex items-center border-t border-neutral-100 py-3 ${
          collapsed ? 'flex-col justify-center gap-3 px-2' : 'gap-2.5 px-4'
        }`}
      >
        <div title={collapsed ? userName : undefined}>
          <Avatar name={userName} imageUrl={userAvatarUrl} size={32} />
        </div>
        {!collapsed && (
          <span className="flex-1 truncate text-sm font-medium text-neutral-900">{userName}</span>
        )}
        <button
          onClick={handleSignOut}
          aria-label="Déconnexion"
          title="Déconnexion"
          className={`hover:text-danger shrink-0 text-neutral-500 ${
            collapsed
              ? 'flex h-9 w-9 items-center justify-center rounded-lg hover:bg-neutral-100'
              : ''
          }`}
        >
          <SignOutIcon size={18} />
        </button>
      </div>
    </aside>
  );
}

'use client';

import {
  BuildingsIcon,
  CarIcon,
  CaretUpDownIcon,
  ChartBarIcon,
  GaugeIcon,
  GearIcon,
  HardHatIcon,
  HandshakeIcon,
  ImageIcon,
  PackageIcon,
  RadioButtonIcon,
  ReceiptIcon,
  ShieldWarningIcon,
  SignOutIcon,
  TruckIcon,
  UsersThreeIcon,
  WalletIcon,
} from '@phosphor-icons/react';

import { Avatar } from '@/components/ui/Avatar';
import { NavItem } from '@/components/ui/NavItem';
import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/components/shell/Sidebar.tsx
 *
 * Doc 04 §4.2.1 — persistent left sidebar: org switcher at top, then the
 * 14-item nav list, account row at the bottom. ~260px fixed width per
 * Doc 05 §3.1.
 *
 * TODO before this is done: the org switcher below is a static display of
 * the active org, not yet the real dropdown (Doc 04 §4.2.1's "same grouped
 * list and 'Create organization' flow as Doc 03 §3.22.2a" — Mes
 * entreprises / Autres organisations grouping). Wiring that up needs the
 * org-membership list query, which is Track B work, not this shell pass.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Tableau de bord', icon: GaugeIcon },
  { href: '/projects', label: 'Chantiers', icon: BuildingsIcon },
  { href: '/dispatch', label: 'Dispatch', icon: TruckIcon },
  { href: '/pointage', label: 'Pointage', icon: RadioButtonIcon },
  { href: '/vehicles', label: 'Véhicules', icon: CarIcon },
  { href: '/team', label: 'Équipe', icon: HardHatIcon },
  { href: '/advances', label: 'Avances', icon: WalletIcon },
  { href: '/materials', label: 'Matériaux', icon: PackageIcon },
  { href: '/journal', label: 'Journal', icon: ImageIcon },
  { href: '/safety', label: 'Sécurité', icon: ShieldWarningIcon },
  { href: '/client-portal', label: 'Portail client', icon: HandshakeIcon },
  { href: '/collaboration', label: 'Collaboration', icon: UsersThreeIcon },
  { href: '/reports', label: 'Rapports', icon: ChartBarIcon },
  { href: '/billing', label: 'Facturation', icon: ReceiptIcon },
  { href: '/settings', label: 'Paramètres', icon: GearIcon },
];

interface SidebarProps {
  organizationName: string;
  userName: string;
  userAvatarUrl?: string;
}

export function Sidebar({ organizationName, userName, userAvatarUrl }: SidebarProps) {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <aside className="bg-neutral-0 flex h-screen w-[286px] shrink-0 flex-col border-e border-neutral-100">
      <div className="border-b border-neutral-100 px-5 py-5">
        <div className="bg-accent-600 inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,118,110,0.18)]">
          TC
        </div>
        <div className="mt-3">
          <p className="text-accent-700 text-[12px] font-semibold uppercase tracking-[0.12em]">
            Tunisia Construction OS
          </p>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Field operations for Tunisian contractors.
          </p>
        </div>
      </div>

      {/* Nav list */}
      <nav className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </div>
      </nav>

      {/* Account row */}
      <div className="border-t border-neutral-100 p-4">
        <div className="bg-neutral-25 flex items-center gap-2.5 rounded-2xl px-3 py-3">
          <Avatar name={userName} imageUrl={userAvatarUrl} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-neutral-900">{userName}</div>
            <div className="truncate text-xs text-neutral-500">{organizationName}</div>
          </div>
          <button
            onClick={handleSignOut}
            aria-label="Se déconnecter"
            className="hover:text-danger rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            <SignOutIcon size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

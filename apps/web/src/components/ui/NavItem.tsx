'use client';

import type { Icon } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * apps/web/src/components/ui/NavItem.tsx
 *
 * Doc 05 §4 — "NavItem: active (filled pill + fill-weight icon), inactive
 * (outline icon), hover (web only). Shared visual logic between mobile
 * bottom-nav and web sidebar." Doc 05 §3.1 — "active item gets an
 * accent-50 filled rounded-rect background behind it, filled-weight icon,
 * accent-600 text; inactive items are outline-weight icon, neutral-500 text."
 *
 * Mobile's equivalent active/inactive swap lives in
 * apps/mobile/src/components/shell/BottomNav.tsx — same icon-weight logic,
 * different container shape (pill row vs. tab bar item).
 */
interface NavItemProps {
  href: string;
  label: string;
  icon: Icon;
  badge?: number;
  collapsed?: boolean;
}

export function NavItem({ href, label, icon: IconComponent, badge, collapsed }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={[
        'rounded-control flex items-center transition-colors duration-150',
        collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2 text-[15.5px]',
        isActive
          ? 'bg-accent-50 text-accent-600 font-medium'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
      ].join(' ')}
    >
      <IconComponent size={19} weight={isActive ? 'fill' : 'regular'} />
      <span className={collapsed ? 'sr-only' : 'flex-1'}>{label}</span>
      {!collapsed && typeof badge === 'number' && badge > 0 && (
        <span className="bg-danger rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

'use client';

import { BellIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';

/**
 * apps/web/src/components/shell/TopBar.tsx
 *
 * Doc 04 §4.2.1 — top bar with search, notification bell, account menu.
 * "No page title repeated" — the sidebar's active NavItem already
 * communicates where you are, so this bar doesn't duplicate it.
 *
 * Doc 01 §1.12 — search is backed by the search_all() RPC, debounced at
 * 250ms. The actual RPC call + results dropdown isn't wired up in this
 * shell pass (needs the org context this component doesn't have yet) —
 * onSearch is a plain callback prop so a parent with org context can wire
 * it up without changing this component.
 */
interface TopBarProps {
  userName: string;
  userAvatarUrl?: string;
  unreadNotifications?: number;
  onSearch?: (query: string) => void;
}

export function TopBar({
  userName,
  userAvatarUrl,
  unreadNotifications = 0,
  onSearch,
}: TopBarProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!onSearch) return;
    const timeout = setTimeout(() => onSearch(query), 250);
    return () => clearTimeout(timeout);
  }, [query, onSearch]);

  return (
    <header className="bg-neutral-0 flex h-16 items-center gap-4 border-b border-neutral-100 px-6">
      <div className="relative w-full max-w-sm">
        <MagnifyingGlassIcon
          size={16}
          className="pointer-events-none absolute inset-y-0 start-3 my-auto text-neutral-500"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un chantier, un ouvrier, un véhicule…"
          className="rounded-control bg-neutral-25 focus:border-accent-600 focus:bg-neutral-0 w-full border border-neutral-300 py-2 pe-3 ps-9 text-sm outline-none"
        />
      </div>

      <div className="ms-auto flex items-center gap-4">
        <button
          aria-label="Notifications"
          className="relative text-neutral-500 hover:text-neutral-900"
        >
          <BellIcon size={20} />
          {unreadNotifications > 0 && (
            <span className="bg-danger absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full" />
          )}
        </button>

        <Avatar name={userName} imageUrl={userAvatarUrl} size={32} />
      </div>
    </header>
  );
}

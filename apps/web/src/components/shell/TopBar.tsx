'use client';

import { Avatar } from '@dala/ui-web';
import { BellIcon, SignOutIcon } from '@phosphor-icons/react';

import { createClient } from '@/lib/supabase/client';

import { GlobalSearch } from './GlobalSearch';


/**
 * apps/web/src/components/shell/TopBar.tsx
 *
 * Web shell consistency pass, Step N — brought in line with
 * apps/admin/src/components/shell/Topbar.tsx: search is now the ⌘K
 * GlobalSearch trigger (see that file for why the underlying `search_all`
 * RPC wasn't touched, only the container), and the identity block (name +
 * role) plus a dedicated sign-out button now live in the bar itself,
 * alongside the sidebar footer's existing sign-out — same as admin keeps
 * its own account/logout affordance in both the sidebar and the topbar.
 */
const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire',
  manager: 'Responsable',
  viewer: 'Observateur',
};

interface TopBarProps {
  userName: string;
  userAvatarUrl?: string;
  userRole?: string;
  /** False for viewers (money-blind, 0103): hides money entries in the command palette. */
  showMoney?: boolean;
  unreadNotifications?: number;
  orgId: string;
}

export function TopBar({
  userName,
  userAvatarUrl,
  userRole,
  showMoney = true,
  unreadNotifications = 0,
  orgId,
}: TopBarProps) {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className="bg-neutral-0 flex h-[72px] items-center gap-4 border-b border-neutral-100 px-6">
      <GlobalSearch orgId={orgId} showMoney={showMoney} />

      <div className="ms-auto flex items-center gap-3">
        <button
          aria-label="Notifications"
          className="relative text-neutral-500 hover:text-neutral-900"
        >
          <BellIcon size={20} />
          {unreadNotifications > 0 && (
            <span className="bg-danger absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full" />
          )}
        </button>

        <div className="flex items-center gap-2.5 pr-1">
          <Avatar name={userName} imageUrl={userAvatarUrl} size={32} />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-neutral-900">{userName}</p>
            {userRole && (
              <p className="text-xs text-neutral-500">{ROLE_LABEL[userRole] ?? userRole}</p>
            )}
          </div>
        </div>

        <button
          onClick={() => void handleSignOut()}
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

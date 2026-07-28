'use client';

import {
  BellIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  NotepadIcon,
  SignOutIcon,
  UserCircleIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

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
  organizationName: string;
  unreadNotifications?: number;
  onSearch?: (query: string) => void;
}

export function TopBar({
  userName,
  userAvatarUrl,
  organizationName,
  unreadNotifications = 0,
  onSearch,
}: TopBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [orgOpen, setOrgOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeOrganization, setActiveOrganization] = useState(organizationName);
  const orgOptions = useMemo(
    () => ['Atlas BTP', organizationName, 'Sahara Infrastructure'],
    [organizationName],
  );

  const notifications = useMemo(
    () => [
      { id: '1', title: 'Dispatch reminder', body: 'Confirm morning crew before 08:30.' },
      { id: '2', title: 'Invoice paid', body: 'El Baraka Residence settled invoice #1042.' },
      { id: '3', title: 'Low stock alert', body: 'Cement stock below 25% on School Annex.' },
    ],
    [],
  );

  useEffect(() => {
    setActiveOrganization(organizationName);
  }, [organizationName]);

  useEffect(() => {
    if (!onSearch) return;
    const timeout = setTimeout(() => onSearch(query), 250);
    return () => clearTimeout(timeout);
  }, [query, onSearch]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className="bg-neutral-25/92 sticky top-0 z-30 border-b border-neutral-100 backdrop-blur-xl">
      <div className="flex h-20 items-center gap-4 px-6 lg:px-8">
        <div className="relative">
          <button
            onClick={() => setOrgOpen((value) => !value)}
            className="bg-neutral-0 hover:border-accent-200 group flex min-w-0 items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-left shadow-[0_4px_14px_rgba(17,19,24,0.04)] transition-colors"
          >
            <div className="bg-accent-600 flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-white">
              {activeOrganization.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-neutral-900">
                {activeOrganization}
              </div>
              <div className="truncate text-xs text-neutral-500">Organization switcher</div>
            </div>
            <CaretDownIcon size={16} className="text-neutral-500" />
          </button>

          {orgOpen && (
            <div className="bg-neutral-0 absolute left-0 top-[76px] z-40 w-[320px] rounded-[20px] border border-neutral-100 p-2 shadow-[0_24px_60px_rgba(17,19,24,0.16)]">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                Switch organization
              </div>
              <div className="space-y-1">
                {orgOptions.map((option) => (
                  <button
                    key={option}
                    className={`hover:bg-neutral-25 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition-colors ${
                      option === activeOrganization
                        ? 'bg-accent-50 text-accent-700'
                        : 'text-neutral-900'
                    }`}
                    onClick={() => {
                      setActiveOrganization(option);
                      setOrgOpen(false);
                    }}
                  >
                    <span className="font-medium">{option}</span>
                    {option === activeOrganization && (
                      <span className="text-xs font-semibold">Current</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative max-w-xl flex-1">
          <MagnifyingGlassIcon
            size={16}
            className="pointer-events-none absolute inset-y-0 start-4 my-auto text-neutral-500"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, workers, vehicles, invoices..."
            className="bg-neutral-0 focus:border-accent-500 w-full rounded-2xl border border-neutral-200 py-3 pe-4 ps-10 text-sm shadow-[0_4px_14px_rgba(17,19,24,0.04)] outline-none transition-colors"
          />
        </div>

        <div className="ms-auto flex items-center gap-2 lg:gap-3">
          <div className="relative">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setProfileOpen(false);
              }}
              className="bg-neutral-0 hover:border-accent-200 relative rounded-2xl border border-neutral-200 p-3 text-neutral-500 shadow-[0_4px_14px_rgba(17,19,24,0.04)] transition-colors hover:text-neutral-900"
            >
              <BellIcon size={19} />
              {unreadNotifications > 0 && (
                <span className="bg-danger absolute end-2 top-2 h-2 w-2 rounded-full" />
              )}
            </button>

            {notificationsOpen && (
              <div className="bg-neutral-0 absolute end-0 top-[58px] z-40 w-[320px] rounded-[20px] border border-neutral-100 p-2 shadow-[0_24px_60px_rgba(17,19,24,0.16)]">
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Notifications
                </div>
                <div className="space-y-1">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="hover:bg-neutral-25 rounded-2xl px-3 py-3 text-left"
                    >
                      <p className="text-sm font-medium text-neutral-900">{notification.title}</p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">{notification.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((value) => !value);
                setNotificationsOpen(false);
              }}
              className="bg-neutral-0 hover:border-accent-200 flex items-center gap-3 rounded-2xl border border-neutral-200 px-3 py-2.5 shadow-[0_4px_14px_rgba(17,19,24,0.04)] transition-colors"
            >
              <Avatar name={userName} imageUrl={userAvatarUrl} size={34} />
              <div className="hidden min-w-0 text-left md:block">
                <div className="truncate text-sm font-semibold text-neutral-900">{userName}</div>
                <div className="truncate text-xs text-neutral-500">Operations lead</div>
              </div>
              <CaretDownIcon size={15} className="text-neutral-500" />
            </button>

            {profileOpen && (
              <div className="bg-neutral-0 absolute end-0 top-[58px] z-40 w-[272px] rounded-[20px] border border-neutral-100 p-2 shadow-[0_24px_60px_rgba(17,19,24,0.16)]">
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Account
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/settings');
                  }}
                  className="hover:bg-neutral-25 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-neutral-900 transition-colors"
                >
                  <UserCircleIcon size={18} className="text-neutral-500" />
                  Profile settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/dashboard');
                  }}
                  className="hover:bg-neutral-25 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-neutral-900 transition-colors"
                >
                  <NotepadIcon size={18} className="text-neutral-500" />
                  Shortcuts
                </button>
                <Button
                  variant="text"
                  onClick={handleSignOut}
                  className="text-danger hover:bg-danger/5 mt-1 flex w-full items-center justify-start gap-3 rounded-2xl px-3 py-3"
                >
                  <SignOutIcon size={18} />
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

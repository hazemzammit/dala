'use client';

import { Avatar } from '@dala/ui-web';
import { BellIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/components/shell/TopBar.tsx
 *
 * Gap-closure guide §2.7 — this component's own previous header comment
 * already documented the plan: `search_all()` (migration 0012, confirmed
 * still exists, `security invoker` so org-scoping is enforced by the
 * caller's own RLS even though `p_org_id` is a plain argument), debounced
 * 250ms, same RPC mobile's Projects-list search bar uses. Only the actual
 * wiring was missing — `onSearch` was a plain unused callback prop.
 *
 * Result rows deep-link into their owning list view with
 * `?highlight=<id>`, a small addition to ProjectsView/TeamView/
 * VehiclesView's existing `?create=1`/`?invite=1` query-param convention —
 * each opens that row's existing detail panel on load rather than landing
 * on an unfiltered list.
 */
interface SearchResult {
  entity_type: 'project' | 'worker' | 'vehicle';
  id: string;
  label: string;
  rank: number;
}

const ENTITY_LABEL: Record<SearchResult['entity_type'], string> = {
  project: 'Chantier',
  worker: 'Ouvrier',
  vehicle: 'Véhicule',
};

const ENTITY_PATH: Record<SearchResult['entity_type'], string> = {
  project: '/projects',
  worker: '/team',
  vehicle: '/vehicles',
};

interface TopBarProps {
  userName: string;
  userAvatarUrl?: string;
  unreadNotifications?: number;
  orgId: string;
}

export function TopBar({ userName, userAvatarUrl, unreadNotifications = 0, orgId }: TopBarProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('search_all', { p_query: trimmed, p_org_id: orgId });
      setResults((data as SearchResult[] | null) ?? []);
      setOpen(true);
      setSearching(false);
    }, 250);

    return () => clearTimeout(timeout);
  }, [query, orgId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery('');
    router.push(`${ENTITY_PATH[result.entity_type]}?highlight=${result.id}`);
  }

  return (
    <header className="bg-neutral-0 flex h-16 items-center gap-4 border-b border-neutral-100 px-6">
      <div ref={containerRef} className="relative w-full max-w-sm">
        <MagnifyingGlassIcon
          size={16}
          className="pointer-events-none absolute inset-y-0 start-3 my-auto text-neutral-500"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          placeholder="Rechercher un chantier, un ouvrier, un véhicule…"
          className="rounded-control bg-neutral-25 focus:border-accent-600 focus:bg-neutral-0 w-full border border-neutral-300 py-2 pe-3 ps-9 text-sm outline-none"
        />

        {open && (
          <div className="bg-neutral-0 absolute start-0 top-full z-50 mt-2 w-full rounded-2xl border border-neutral-100 py-2 shadow-lg">
            {searching ? (
              <p className="px-4 py-2 text-sm text-neutral-500">Recherche…</p>
            ) : results.length === 0 ? (
              <p className="px-4 py-2 text-sm text-neutral-500">Aucun résultat.</p>
            ) : (
              results.map((r) => (
                <button
                  key={`${r.entity_type}-${r.id}`}
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2 text-start hover:bg-neutral-100"
                >
                  <span className="text-sm font-medium text-neutral-900">{r.label}</span>
                  <span className="text-xs text-neutral-500">{ENTITY_LABEL[r.entity_type]}</span>
                </button>
              ))
            )}
          </div>
        )}
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

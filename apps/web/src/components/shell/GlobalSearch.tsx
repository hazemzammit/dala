'use client';

import { Card } from '@dala/ui-web';
import { ArrowRightIcon, ClockIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/components/shell/GlobalSearch.tsx
 *
 * Web shell consistency pass, Step N — replaces TopBar's previous
 * always-open plain `<input>` with the same ⌘K command-palette pattern
 * apps/admin/src/components/shell/GlobalSearch.tsx already uses (trigger
 * button + centered modal, "Récent"/"Actions" sections when the query is
 * empty).
 *
 * Deliberately NOT a rebuild of the search backend: the previous TopBar
 * was already calling a real, working RPC (`search_all`, migration 0012,
 * security invoker — org-scoping enforced by the caller's own RLS) across
 * projects/workers/vehicles with debounce and rank ordering. Admin's
 * version hits a bespoke `/api/admin/search` route because it has no
 * equivalent RPC to call; web does, so this component calls `search_all`
 * directly via the browser Supabase client, same as the code it replaces.
 * Only the container chrome and empty-state sections are new.
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

/**
 * Quick-navigation targets for the palette's "Actions" section — mirrored
 * verbatim from Sidebar.tsx's NAV_GROUPS (href + label only). Deliberately
 * kept in this file rather than imported so the palette stays
 * self-contained, matching admin's GlobalSearch's own stated rationale —
 * update BOTH lists if a nav item ever changes.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Tableau de bord' },
  { href: '/projects', label: 'Chantiers' },
  { href: '/dispatch', label: 'Dispatch' },
  { href: '/vehicles', label: 'Véhicules' },
  { href: '/team', label: 'Équipe' },
  { href: '/materials', label: 'Matériaux' },
  { href: '/journal', label: 'Journal' },
  { href: '/safety', label: 'Sécurité' },
  { href: '/advances', label: 'Avances' },
  { href: '/billing', label: 'Facturation' },
  { href: '/client-portal', label: 'Portail client' },
  { href: '/collaboration', label: 'Collaboration' },
  { href: '/reports', label: 'Rapports' },
  { href: '/settings', label: 'Paramètres' },
] as const;

const RECENT_KEY = 'dala-web-palette-recent';
const RECENT_LIMIT = 5;

function readRecent(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(hrefs: string[]) {
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(hrefs));
  } catch {
    // sessionStorage unavailable (private mode / storage full) — the
    // palette still works, it just won't remember this visit.
  }
}

function navItemForPath(p: string) {
  return NAV_ITEMS.find((item) => p === item.href || p.startsWith(`${item.href}/`));
}

interface GlobalSearchProps {
  orgId: string;
  showMoney?: boolean;
}

/**
 * Destinations that are money screens. Viewers (Observateur) are money-blind
 * (migration 0103) — the pages themselves render a restricted state; these are
 * hidden from the palette so they are not offered in the first place.
 */
const MONEY_HREFS: ReadonlySet<string> = new Set(['/advances', '/billing', '/reports']);

export function GlobalSearch({ orgId, showMoney = true }: GlobalSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('search_all', { p_query: trimmed, p_org_id: orgId });
      setResults((data as SearchResult[] | null) ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, orgId, open]);

  // Record the current page as a visit so "Récent" reflects real
  // navigation, same pattern as admin's GlobalSearch.
  useEffect(() => {
    if (!pathname) return;
    const item = navItemForPath(pathname);
    if (!item) return;
    const recent = readRecent();
    const next = [item.href, ...recent.filter((h) => h !== item.href)].slice(0, RECENT_LIMIT);
    if (next.join('\u0000') !== recent.join('\u0000')) writeRecent(next);
  }, [pathname]);

  function goTo(path: string) {
    setOpen(false);
    router.push(path);
  }

  function handleSelect(result: SearchResult) {
    goTo(`${ENTITY_PATH[result.entity_type]}/${result.id}`);
  }

  const recentHrefs = readRecent();
  const recentItems = recentHrefs
    .map((href) => NAV_ITEMS.find((item) => item.href === href))
    .filter(
      (item): item is (typeof NAV_ITEMS)[number] =>
        item !== undefined && (showMoney || !MONEY_HREFS.has(item.href)),
    );
  const actionItems = NAV_ITEMS.filter(
    (item) => !recentHrefs.includes(item.href) && (showMoney || !MONEY_HREFS.has(item.href)),
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-control bg-neutral-0 flex w-full max-w-sm items-center gap-2 border border-neutral-200 px-3.5 py-2 text-sm text-neutral-500 shadow-[0_1px_2px_rgba(17,19,24,0.05)] transition-all duration-150 hover:-translate-y-px hover:border-neutral-300 hover:shadow-[0_2px_6px_rgba(17,19,24,0.08)]"
      >
        <MagnifyingGlassIcon size={15} />
        Rechercher un chantier, un ouvrier, un véhicule…
        <kbd className="ms-auto rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/40 p-4 pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <Card
            raised
            className="w-full max-w-lg overflow-hidden p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
              <MagnifyingGlassIcon size={16} className="text-neutral-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un chantier, un ouvrier, un véhicule…"
                className="w-full text-[15.5px] text-neutral-900 outline-none placeholder:text-neutral-500"
              />
            </div>

            <div className="max-h-96 overflow-y-auto">
              {query.trim().length === 0 && (
                <div>
                  {recentItems.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Récent
                      </p>
                      {recentItems.map((item) => (
                        <button
                          key={`recent-${item.href}`}
                          onClick={() => goTo(item.href)}
                          className="hover:bg-neutral-25 flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm"
                        >
                          <ClockIcon size={16} className="text-neutral-500" />
                          <span className="text-neutral-900">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {actionItems.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Actions
                      </p>
                      {actionItems.map((item) => (
                        <button
                          key={`action-${item.href}`}
                          onClick={() => goTo(item.href)}
                          className="hover:bg-neutral-25 flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm"
                        >
                          <ArrowRightIcon size={16} className="text-neutral-500" />
                          <span className="text-neutral-900">Aller à {item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {searching && (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">Recherche…</p>
              )}

              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">Aucun résultat.</p>
              )}

              {!searching && results.length > 0 && (
                <div>
                  {results.map((r) => (
                    <button
                      key={`${r.entity_type}-${r.id}`}
                      onClick={() => handleSelect(r)}
                      className="hover:bg-neutral-25 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm"
                    >
                      <span className="font-medium text-neutral-900">{r.label}</span>
                      <span className="text-xs text-neutral-500">
                        {ENTITY_LABEL[r.entity_type]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

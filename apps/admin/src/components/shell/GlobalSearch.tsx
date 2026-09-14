'use client';

import { Card } from '@dala/ui-web';
import {
  ArrowRightIcon,
  BuildingsIcon,
  ClipboardTextIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface SearchResults {
  organizations: { id: string; name: string; plan: string }[];
  users: { id: string; full_name: string; phone: string | null }[];
  auditLogEntries: {
    id: string;
    action: string;
    target_table: string | null;
    created_at: string;
  }[];
}

const EMPTY_RESULTS: SearchResults = { organizations: [], users: [], auditLogEntries: [] };

/**
 * Quick-navigation targets for the palette's "Actions" section (guide §5):
 * every sidebar item, mirrored verbatim from Sidebar.tsx's NAV_GROUPS
 * (href + label only — the sidebar's per-item icons aren't needed here).
 * Deliberately kept in this file rather than importing from Sidebar so the
 * palette stays self-contained; update BOTH lists if a nav item ever
 * changes.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Métriques' },
  { href: '/organizations', label: 'Organisations' },
  { href: '/users', label: 'Utilisateurs' },
  { href: '/billing', label: 'Facturation' },
  { href: '/storage', label: 'Stockage' },
  { href: '/services-health', label: 'Santé des services' },
  { href: '/app-versions', label: "Versions de l'app" },
  { href: '/feature-flags', label: 'Feature flags' },
  { href: '/announcements', label: 'Annonces' },
  { href: '/audit-log', label: "Journal d'audit" },
  { href: '/db-explorer', label: 'Database Explorer' },
  { href: '/admin-users', label: 'Gestion des admins' },
  { href: '/admin-sessions', label: 'Sessions admin' },
] as const;

const RECENT_KEY = 'dala-admin-palette-recent';
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
    // sessionStorage unavailable (private mode / storage full) — the palette
    // still works, it just won't remember this visit.
  }
}

function navItemForPath(p: string) {
  return NAV_ITEMS.find((item) => p === item.href || p.startsWith(`${item.href}/`));
}

/**
 * apps/admin/src/components/shell/GlobalSearch.tsx
 *
 * Admin remediation Tier 4.4 — global cross-entity search. Checked Doc
 * 05's component inventory before building this (per the plan's own
 * instruction): nothing in it covers a command palette or search modal,
 * so this is new visual language, kept as plain as the plan allows for —
 * "a plain input + dropdown results list," styled with the exact same
 * overlay + Card(raised) primitives ConfirmTypingDialog (packages/
 * ui-web, since 19D) already established for this app's one other
 * modal, not a new pattern.
 *
 * ⌘K / Ctrl+K to open (global keydown listener), Escape to close, click-
 * outside to close. Each result links straight to the relevant detail
 * page and closes the palette — audit_log entries link to the Audit Log
 * screen pre-filtered by that action (the closest thing to a "detail
 * page" an audit_log row has, since it isn't its own screen).
 *
 * Guide §5 — when the query is empty the palette shows two quick-navigation
 * sections instead of search results: "Récent" (last 5 distinct pages
 * visited this session, sessionStorage-backed) and "Actions" (every sidebar
 * item not already in "Récent", as "Aller à …"). No "+ Créer …" action:
 * no create-flow exists in this app.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

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
      setQ('');
      setResults(EMPTY_RESULTS);
      // Focus after the modal has actually mounted — a same-tick focus()
      // call on a just-rendered input is unreliable across browsers.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open]);

  // Record the current page as a visit so "Récent" reflects real navigation
  // regardless of how it happened (sidebar click, palette push, back/forward).
  // Detail pages map back to their sidebar item (e.g. /organizations/{id} →
  // /organizations), so they record one entry, not one per id.
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

  const hasResults =
    results.organizations.length > 0 ||
    results.users.length > 0 ||
    results.auditLogEntries.length > 0;

  const recentHrefs = readRecent();
  const recentItems = recentHrefs
    .map((href) => NAV_ITEMS.find((item) => item.href === href))
    .filter((item): item is (typeof NAV_ITEMS)[number] => item !== undefined);
  const actionItems = NAV_ITEMS.filter((item) => !recentHrefs.includes(item.href));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-control bg-neutral-0 flex items-center gap-2 border border-neutral-200 px-3.5 py-2 text-sm text-neutral-500 shadow-[0_1px_2px_rgba(17,19,24,0.05)] transition-all duration-150 hover:-translate-y-px hover:border-neutral-300 hover:shadow-[0_2px_6px_rgba(17,19,24,0.08)]"
      >
        <MagnifyingGlassIcon size={15} />
        Rechercher
        <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
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
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher une organisation, un utilisateur, une action…"
                className="w-full text-[15.5px] text-neutral-900 outline-none placeholder:text-neutral-500"
              />
            </div>

            <div className="max-h-96 overflow-y-auto">
              {!loading && q.trim().length === 0 && (
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

              {loading && (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">Recherche…</p>
              )}

              {!loading && q.trim().length >= 2 && !hasResults && (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">Aucun résultat.</p>
              )}

              {!loading && results.organizations.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Organisations
                  </p>
                  {results.organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => goTo(`/organizations/${org.id}`)}
                      className="hover:bg-neutral-25 flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm"
                    >
                      <BuildingsIcon size={16} className="text-neutral-500" />
                      <span className="text-neutral-900">{org.name}</span>
                      <span className="text-xs text-neutral-500">{org.plan}</span>
                    </button>
                  ))}
                </div>
              )}

              {!loading && results.users.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Utilisateurs
                  </p>
                  {results.users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => goTo(`/users?q=${encodeURIComponent(user.full_name)}`)}
                      className="hover:bg-neutral-25 flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm"
                    >
                      <UsersThreeIcon size={16} className="text-neutral-500" />
                      <span className="text-neutral-900">{user.full_name}</span>
                    </button>
                  ))}
                </div>
              )}

              {!loading && results.auditLogEntries.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Journal d'audit
                  </p>
                  {results.auditLogEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => goTo(`/audit-log?action=${encodeURIComponent(entry.action)}`)}
                      className="hover:bg-neutral-25 flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm"
                    >
                      <ClipboardTextIcon size={16} className="text-neutral-500" />
                      <span className="font-mono text-xs text-neutral-900">{entry.action}</span>
                      <span className="text-xs text-neutral-500">
                        {new Date(entry.created_at).toLocaleDateString('fr-FR')}
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

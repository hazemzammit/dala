'use client';

import { Card } from '@dala/ui-web';
import {
  BuildingsIcon,
  ClipboardTextIcon,
  MagnifyingGlassIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
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
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
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

  function goTo(path: string) {
    setOpen(false);
    router.push(path);
  }

  const hasResults =
    results.organizations.length > 0 ||
    results.users.length > 0 ||
    results.auditLogEntries.length > 0;

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

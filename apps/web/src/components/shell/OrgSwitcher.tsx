'use client';

import { Avatar } from '@dala/ui-web';
import { CaretUpDownIcon, CheckIcon, PlusIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/components/shell/OrgSwitcher.tsx
 *
 * Loose-end follow-up to the web shell consistency pass — Sidebar.tsx
 * previously had a TODO here: "static display of the active org, not yet
 * the real dropdown." This is that dropdown.
 *
 * Per Doc 04 §4.2.1 ("same grouped list and 'Create organization' flow as
 * Doc 03 §3.22.2a … same 'Mes entreprises' / 'Autres organisations'
 * grouping, same create-org form"): groups every org the user belongs to
 * by role (owner -> "Mes entreprises", anything else -> "Autres
 * organisations"), marks the active one, and a pinned "+ Créer une
 * nouvelle entreprise" row. Switching updates `profiles.active_org_id` —
 * the exact same update+refresh pattern already used by
 * OrganizationsOverviewView.tsx's own handleSwitch, reused here rather
 * than reinvented.
 *
 * Deliberately simplified vs the full mobile spec for this first pass:
 * - No org logo images. The spec's own bug-fix note says every org logo
 *   needs a signed-URL resolution step (`logo_url` is a private-bucket
 *   storage path, not a fetchable URL) via a batched `getSignedUrlMap` —
 *   real work belonging to whoever's already touching that helper
 *   elsewhere, not invented fresh here. Every row uses the same
 *   initial-letter <Avatar> already used for the org chip elsewhere in
 *   this sidebar.
 * - No project-membership ("trade participant") orgs — only rows from
 *   `organization_members` are listed. Doc 03's parenthetical ("or a
 *   trade participant via project membership") describes a second,
 *   separate membership path (project_members, not organization_members)
 *   that nothing else in this codebase surfaces in an org list yet either
 *   — a real gap, but a bigger one than this dropdown should silently
 *   take on.
 * - No mid-task "unsaved changes" confirm dialog on switch (Doc 03's
 *   edge case) — no in-progress-form-detection mechanism exists anywhere
 *   in this codebase to hook into.
 */
interface OrgRow {
  org_id: string;
  name: string;
  role: 'owner' | 'manager' | 'viewer';
}

interface OrgSwitcherProps {
  userId: string;
  activeOrgId: string;
  activeOrgName: string;
  collapsed?: boolean;
}

export function OrgSwitcher({ userId, activeOrgId, activeOrgName, collapsed }: OrgSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next && orgs === null) {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('organization_members')
        .select('org_id, role, organizations(name)')
        .eq('user_id', userId);
      const rows: OrgRow[] = (data ?? [])
        .map((m) => {
          const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
          return {
            org_id: m.org_id as string,
            role: m.role as OrgRow['role'],
            name: (org as { name: string } | undefined)?.name ?? '—',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      setOrgs(rows);
      setLoading(false);
    }
  }

  async function handleSwitch(orgId: string) {
    if (orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    setSwitchingOrgId(orgId);
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ active_org_id: orgId })
      .eq('id', userId);
    if (!error) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setSwitchingOrgId(null);
    }
  }

  function handleCreate() {
    setOpen(false);
    router.push('/create-organization');
  }

  const owned = (orgs ?? []).filter((o) => o.role === 'owner');
  const other = (orgs ?? []).filter((o) => o.role !== 'owner');

  return (
    <div ref={wrapRef} className="relative border-b border-neutral-100">
      <button
        onClick={() => void handleOpen()}
        className={`hover:bg-neutral-25 flex w-full items-center text-start ${
          collapsed ? 'justify-center px-2 py-3' : 'gap-2.5 px-4 py-4'
        }`}
        title={collapsed ? activeOrgName : undefined}
      >
        <div className="rounded-control bg-accent-100 text-accent-700 flex h-10 w-10 shrink-0 items-center justify-center text-sm font-semibold">
          {activeOrgName.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-sm font-medium text-neutral-900">
              {activeOrgName}
            </span>
            <CaretUpDownIcon size={16} className="text-neutral-500" />
          </>
        )}
      </button>

      {open && (
        <div
          className={`bg-neutral-0 rounded-card absolute top-full z-40 mt-1 w-72 border border-neutral-100 py-2 shadow-[0_24px_60px_rgba(17,19,24,0.16)] ${
            collapsed ? 'start-full ms-2' : 'start-3'
          }`}
        >
          {loading && <p className="px-4 py-4 text-sm text-neutral-500">Chargement…</p>}

          {!loading && owned.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                Mes entreprises
              </p>
              {owned.map((org) => (
                <OrgRowButton
                  key={org.org_id}
                  org={org}
                  isActive={org.org_id === activeOrgId}
                  isSwitching={switchingOrgId === org.org_id}
                  onClick={() => void handleSwitch(org.org_id)}
                />
              ))}
            </div>
          )}

          {!loading && other.length > 0 && (
            <div className="mt-2">
              <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                Autres organisations
              </p>
              {other.map((org) => (
                <OrgRowButton
                  key={org.org_id}
                  org={org}
                  isActive={org.org_id === activeOrgId}
                  isSwitching={switchingOrgId === org.org_id}
                  onClick={() => void handleSwitch(org.org_id)}
                />
              ))}
            </div>
          )}

          <div className="mt-2 border-t border-neutral-100 pt-2">
            <button
              onClick={handleCreate}
              className="hover:bg-neutral-25 text-accent-600 flex w-full items-center gap-2.5 px-4 py-2.5 text-start text-sm font-medium"
            >
              <PlusIcon size={16} />
              Créer une nouvelle entreprise
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ROLE_LABEL: Record<OrgRow['role'], string> = {
  owner: 'Propriétaire',
  manager: 'Responsable',
  viewer: 'Observateur',
};

function OrgRowButton({
  org,
  isActive,
  isSwitching,
  onClick,
}: {
  org: OrgRow;
  isActive: boolean;
  isSwitching: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isSwitching}
      className="hover:bg-neutral-25 flex w-full items-center gap-2.5 px-4 py-2.5 text-start disabled:opacity-60"
    >
      <Avatar name={org.name} size={28} />
      <span className="flex-1 truncate">
        <span className="block text-sm font-medium text-neutral-900">{org.name}</span>
        <span className="block text-xs text-neutral-500">{ROLE_LABEL[org.role]}</span>
      </span>
      {isSwitching ? (
        <span className="text-xs text-neutral-500">…</span>
      ) : (
        isActive && <CheckIcon size={16} className="text-accent-600 shrink-0" />
      )}
    </button>
  );
}

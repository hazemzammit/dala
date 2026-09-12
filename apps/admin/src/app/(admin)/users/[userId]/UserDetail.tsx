'use client';

import { DetailHeader, ErrorState, StatusBadge } from '@dala/ui-web';
import { UsersThreeIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { NotesPanel } from '@/components/ui/NotesPanel';

interface UserSummary {
  id: string;
  full_name: string;
  email: string | null;
  suspended_at: string | null;
}

/**
 * apps/admin/src/app/(admin)/users/[userId]/UserDetail.tsx
 *
 * Admin remediation Tier 4.8 — minimal by design (see page.tsx's own
 * header for the scope cut this follows). Just enough header context
 * (name/email/status) to make the notes panel below it meaningful, not a
 * full user-detail page.
 *
 * Phase 5 (plan §5.5) — the bare <h1> + <Card> field grid becomes a
 * DetailHeader (backHref "/users", initials circle — users have no logo
 * field, and DetailHeader already derives initials from the title). Only
 * the fields this page's GET actually returns surface here (email as
 * header meta, status as the header badge — verified against
 * api/admin/users/[userId]/route.ts: it selects id/full_name/suspended_at
 * and joins email; nothing invented). NotesPanel stays exactly as-is per
 * §0.2 — deliberately NOT wrapped in a SectionCard: it renders its own
 * "Notes internes" heading, and a second copy from a SectionCard title
 * would fail admin-notes.spec.ts's getByText under Playwright strict
 * mode (ruling: keep NotesPanel untouched, per §0.2/§5.3).
 */
export function UserDetail({ userId }: { userId: string }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  // Phase 20 (§1.7a) — no res.ok check at all; a failure previously
  // left the screen on "Chargement…" permanently, with no retry.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/admin/users/${userId}`)
      .then((res) => {
        if (!res.ok) throw new Error('request failed');
        return res.json();
      })
      .then((data) => setUser(data.user ?? null))
      .catch(() => setLoadError(true));
  }, [userId, reloadKey]);

  if (loadError) return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!user) return <p className="text-sm text-neutral-500">Chargement…</p>;

  return (
    <div className="space-y-6">
      <DetailHeader
        backHref="/users"
        backLabel="Utilisateurs"
        icon={UsersThreeIcon}
        title={user.full_name}
        status={
          user.suspended_at ? (
            <StatusBadge variant="warning">Suspendu</StatusBadge>
          ) : (
            <StatusBadge variant="success">Actif</StatusBadge>
          )
        }
        meta={[{ label: 'Email', value: user.email ?? '—' }]}
      />

      {/* NotesPanel stays exactly as-is (admin-local, §0.2) — no SectionCard
          wrap; see the file header for the strict-mode reason. */}
      <NotesPanel targetType="user" targetId={userId} />
    </div>
  );
}

'use client';

import { Card, ErrorState, StatusBadge } from '@dala/ui-web';
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
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900">{user.full_name}</h1>
      </div>

      <Card className="p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">Email</dt>
            <dd className="mt-1 text-neutral-900">{user.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">Statut</dt>
            <dd className="mt-1">
              {user.suspended_at ? (
                <StatusBadge variant="warning">Suspendu</StatusBadge>
              ) : (
                <StatusBadge variant="success">Actif</StatusBadge>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <NotesPanel targetType="user" targetId={userId} />
    </div>
  );
}

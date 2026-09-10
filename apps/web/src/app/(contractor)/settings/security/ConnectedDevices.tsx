'use client';

import { Button, StatusBadge } from '@dala/ui-web';
import { DesktopIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  is_current: boolean;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * apps/web/src/app/(contractor)/settings/security/ConnectedDevices.tsx
 *
 * Gap-closure guide §2.6 — backed by the new `list_own_sessions()` /
 * `revoke_own_session()` RPCs (migration 0078). No device/browser/city
 * columns — see that migration's header for why. Rows are shown as
 * "Session" + relative dates rather than invented device names, since
 * there's no real data to label them with.
 */
export function ConnectedDevices() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<SessionRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('list_own_sessions');
    if (rpcError) {
      setError('Impossible de charger les sessions.');
      return;
    }
    setSessions((data as SessionRow[] | null) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('revoke_own_session', {
      p_session_id: revokeTarget.id,
    });
    setRevoking(false);
    if (rpcError) {
      setError('Impossible de déconnecter cette session.');
      setRevokeTarget(null);
      return;
    }
    setRevokeTarget(null);
    await load();
  }

  return (
    <SectionCard
      title="Appareils connectés"
      description="Sessions actives sur votre compte. Déconnectez celles que vous ne reconnaissez pas."
    >
      {error && <p className="text-danger mb-2 text-sm">{error}</p>}

      {sessions === null ? (
        <p className="text-sm text-neutral-500">Chargement…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune session active.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-100 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <DesktopIcon size={20} className="text-neutral-500" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-900">Session</p>
                    {session.is_current && <StatusBadge variant="success">Actuelle</StatusBadge>}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Dernière activité {formatDateTime(session.updated_at)} · Connectée le{' '}
                    {formatDateTime(session.created_at)}
                  </p>
                </div>
              </div>
              {!session.is_current && (
                <Button
                  variant="secondary"
                  fullWidth={false}
                  onClick={() => setRevokeTarget(session)}
                >
                  Déconnecter
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Déconnecter cette session ?"
        description="L'appareil concerné devra se reconnecter."
        confirmLabel="Déconnecter"
        loading={revoking}
        onConfirm={() => void handleRevoke()}
        onCancel={() => setRevokeTarget(null)}
      />
    </SectionCard>
  );
}

'use client';

import type { ClientPortal } from '@dala/shared-types';
import { Button, Card, FormField, StatusBadge } from '@dala/ui-web';
import { CheckIcon, CopyIcon, LinkIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Switch } from '@/components/ui/Switch';

import { disableClientPortalPin, generateClientPortalLink, setClientPortalPin } from './actions';


/**
 * Field-coverage pass — the whole point of this component. Web's
 * `/client-portal` page was a read-only internal rollup with no way to
 * generate a client's share link, toggle PIN protection, or reset a PIN —
 * mobile's client-portal.tsx has had all three since migration 0020. Same
 * three RPCs, same field-coverage-pass philosophy as everywhere else in
 * this pass: no new backend behavior, just a missing web caller.
 */
export function ClientPortalManager({
  projects,
  portalByProjectId,
}: {
  projects: { id: string; name: string }[];
  portalByProjectId: Record<string, ClientPortal | undefined>;
}) {
  const [portals, setPortals] = useState(portalByProjectId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function handleGenerateLink(projectId: string) {
    setPending(projectId);
    setError(null);
    const result = await generateClientPortalLink(projectId);
    setPending(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPortals((current) => ({ ...current, [projectId]: result.portal }));
  }

  async function handleCopyLink(portal: ClientPortal) {
    const url = `https://app.dala.tn/portail/${portal.link_token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(portal.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleTogglePin(projectId: string, portal: ClientPortal, enable: boolean) {
    if (!enable) {
      setPending(projectId);
      setError(null);
      const result = await disableClientPortalPin(projectId);
      setPending(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPortals((current) => ({ ...current, [projectId]: result.portal }));
      return;
    }
    setExpandedId(projectId);
    setPinDraft('');
  }

  async function handleSavePin(projectId: string) {
    if (!/^\d{4}$/.test(pinDraft)) {
      setError('Le code doit contenir exactement 4 chiffres.');
      return;
    }
    setPending(projectId);
    setError(null);
    const result = await setClientPortalPin({ project_id: projectId, pin: pinDraft });
    setPending(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPortals((current) => ({ ...current, [projectId]: result.portal }));
    setExpandedId(null);
    setPinDraft('');
  }

  if (projects.length === 0) {
    return <p className="text-sm text-neutral-500">Aucun chantier actif pour le moment.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-danger text-sm">{error}</p>}
      {projects.map((project) => {
        const portal = portals[project.id];
        const isPending = pending === project.id;
        return (
          <Card key={project.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900">{project.name}</p>
                {portal ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                    <LinkIcon size={12} />
                    …/portail/{portal.link_token.slice(0, 10)}…
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-neutral-500">Aucun lien généré.</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {portal && (
                  <button
                    onClick={() => void handleCopyLink(portal)}
                    className="rounded-control flex items-center gap-1.5 border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    {copiedId === portal.id ? (
                      <>
                        <CheckIcon size={14} /> Copié
                      </>
                    ) : (
                      <>
                        <CopyIcon size={14} /> Copier
                      </>
                    )}
                  </button>
                )}
                <Button
                  variant="secondary"
                  loading={isPending}
                  onClick={() => void handleGenerateLink(project.id)}
                >
                  {portal ? 'Régénérer le lien' : 'Générer un lien'}
                </Button>
              </div>
            </div>

            {portal && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                <div className="flex items-center gap-2.5">
                  <Switch
                    checked={portal.pin_enabled}
                    onChange={(checked) => void handleTogglePin(project.id, portal, checked)}
                    disabled={isPending}
                    label="Protéger par code PIN"
                  />
                  <span className="text-sm text-neutral-700">Protéger par code PIN</span>
                  {portal.pin_enabled && <StatusBadge variant="success">Activé</StatusBadge>}
                </div>

                {portal.pin_enabled && expandedId !== project.id && (
                  <button
                    onClick={() => {
                      setExpandedId(project.id);
                      setPinDraft('');
                    }}
                    className="text-accent-600 text-sm font-medium"
                  >
                    Réinitialiser le PIN
                  </button>
                )}
              </div>
            )}

            {expandedId === project.id && (
              <div className="mt-3 flex items-end gap-3 border-t border-neutral-100 pt-3">
                <FormField
                  label={portal?.pin_enabled ? 'Réinitialiser le PIN du client' : 'Code PIN (4 chiffres)'}
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  inputMode="numeric"
                />
                <Button loading={isPending} onClick={() => void handleSavePin(project.id)}>
                  Enregistrer
                </Button>
                <Button variant="secondary" onClick={() => setExpandedId(null)}>
                  Annuler
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

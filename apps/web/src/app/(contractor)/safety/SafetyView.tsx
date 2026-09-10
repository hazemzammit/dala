'use client';

import { Avatar, Card, StatusBadge } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { ShieldWarningIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { IncidentFormModal } from './IncidentFormModal';
import { InsuranceFormModal } from './InsuranceFormModal';

import { SectionCard } from '@/components/contractor/Screen';

type Incident = {
  id: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
  incident_type: string | null;
  location: string | null;
  photo_url: string | null;
  signed_photo_url?: string | null;
  created_at: string;
};
type Insurance = {
  id: string;
  provider_name: string;
  policy_number: string | null;
  coverage_type: string | null;
  expires_at: string | null;
  reminder_enabled: boolean;
  created_at: string;
};

const SEVERITY_LABEL: Record<Incident['severity'], string> = {
  minor: 'Mineur',
  moderate: 'Modéré',
  severe: 'Grave',
};
const SEVERITY_VARIANT: Record<Incident['severity'], 'success' | 'warning' | 'danger'> = {
  minor: 'success',
  moderate: 'warning',
  severe: 'danger',
};

type ActiveModule = 'none' | 'incidents' | 'insurance';

/**
 * FLAGGED FOR HAZEM — "PPE checklist" and "Risk alerts" modules (and their
 * summary cards) were removed from this view. Neither has a backing table,
 * RLS policy, or validation schema anywhere in this repo — see the header
 * comment in actions.ts for the full explanation. Only Incidents and
 * Assurances (matching mobile's safety.tsx) remain.
 */
export function SafetyView({
  incidents,
  insurances,
  workerNamesByIncidentId,
}: {
  incidents: Incident[];
  insurances: Insurance[];
  workerNamesByIncidentId: Record<string, string[]>;
}) {
  const [activeModule, setActiveModule] = useState<ActiveModule>('none');
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  // Fix 3c — the incident detail view this file previously had none of.
  const [detailIncident, setDetailIncident] = useState<Incident | null>(null);

  const expiringSoonCount = insurances.filter((ins) => {
    if (!ins.expires_at) return false;
    const days = (new Date(ins.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        eyebrow="Compliance"
        title="Sécurité"
        description="Suivez les incidents et les assurances de l'organisation."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5" raised>
          <ShieldWarningIcon size={22} className="text-warning" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Incidents
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {incidents.length}
          </p>
        </Card>
        <Card className="p-5" raised>
          <ShieldWarningIcon size={22} className="text-warning" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Assurances
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {expiringSoonCount > 0 ? `${expiringSoonCount} expire(nt) bientôt` : insurances.length}
          </p>
        </Card>
      </div>

      <SectionCard
        title="Modules de sécurité"
        description="Contrôles utilisés sur un chantier actif."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => setActiveModule('incidents')}
            className="bg-neutral-25 hover:border-accent-300 rounded-2xl border border-neutral-100 px-4 py-5 text-left transition-colors"
          >
            <p className="font-medium text-neutral-900">Incidents</p>
            <p className="mt-1 text-sm text-neutral-500">
              Voir et signaler les incidents de sécurité.
            </p>
          </button>

          <button
            onClick={() => setActiveModule('insurance')}
            className="bg-neutral-25 hover:border-accent-300 rounded-2xl border border-neutral-100 px-4 py-5 text-left transition-colors"
          >
            <p className="font-medium text-neutral-900">Assurances</p>
            <p className="mt-1 text-sm text-neutral-500">
              Voir et ajouter les polices d&apos;assurance.
            </p>
          </button>
        </div>
      </SectionCard>

      {activeModule === 'incidents' && (
        <SectionCard
          title="Incidents"
          description="Historique des incidents signalés."
          actions={
            <button
              onClick={() => setIncidentModalOpen(true)}
              className="text-accent-600 text-sm font-medium hover:underline"
            >
              + Signaler un incident
            </button>
          }
        >
          {incidents.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun incident signalé.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {incidents.map((inc) => (
                <button
                  key={inc.id}
                  onClick={() => setDetailIncident(inc)}
                  className="hover:border-accent-300 flex items-center justify-between rounded-2xl border border-neutral-100 px-4 py-3 text-left transition-colors"
                >
                  <div>
                    <p className="text-sm text-neutral-900">
                      {inc.description}
                      {inc.incident_type ? ` · ${inc.incident_type}` : ''}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(inc.created_at).toLocaleDateString('fr-TN')}
                      {inc.location ? ` · ${inc.location}` : ''}
                    </p>
                  </div>
                  <StatusBadge variant={SEVERITY_VARIANT[inc.severity]}>
                    {SEVERITY_LABEL[inc.severity]}
                  </StatusBadge>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {activeModule === 'insurance' && (
        <SectionCard
          title="Assurances"
          description="Polices d'assurance de l'organisation."
          actions={
            <button
              onClick={() => setInsuranceModalOpen(true)}
              className="text-accent-600 text-sm font-medium hover:underline"
            >
              + Ajouter une assurance
            </button>
          }
        >
          {insurances.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune assurance enregistrée.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {insurances.map((ins) => (
                <div
                  key={ins.id}
                  className="flex items-center justify-between rounded-2xl border border-neutral-100 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-neutral-900">
                      {ins.provider_name}
                      {ins.coverage_type ? ` · ${ins.coverage_type}` : ''}
                    </p>
                    {ins.policy_number && (
                      <p className="text-xs text-neutral-500">Police n° {ins.policy_number}</p>
                    )}
                  </div>
                  {ins.expires_at && (
                    <p className="text-xs text-neutral-500">
                      Expire le {new Date(ins.expires_at).toLocaleDateString('fr-TN')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {incidentModalOpen && <IncidentFormModal onClose={() => setIncidentModalOpen(false)} />}
      {insuranceModalOpen && <InsuranceFormModal onClose={() => setInsuranceModalOpen(false)} />}

      {/* Fix 3c — incident detail view, mirroring mobile's safety.tsx
          detail sheet (description, severity, location, photo,
          "Travailleurs impliqués", timestamp). Same modal shell as
          IncidentFormModal.tsx above for visual consistency. */}
      {detailIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card raised className="w-full max-w-md p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-neutral-900">
                Détail de l&apos;incident
              </h2>
              <button
                onClick={() => setDetailIncident(null)}
                className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
                aria-label="Fermer"
              >
                <XIcon size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {detailIncident.signed_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detailIncident.signed_photo_url}
                  alt="Photo de l'incident"
                  className="h-48 w-full rounded-2xl object-cover"
                />
              )}

              <p className="text-sm text-neutral-900">
                {detailIncident.description}
                {detailIncident.incident_type ? ` · ${detailIncident.incident_type}` : ''}
              </p>

              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-neutral-500">Gravité</p>
                  <StatusBadge variant={SEVERITY_VARIANT[detailIncident.severity]}>
                    {SEVERITY_LABEL[detailIncident.severity]}
                  </StatusBadge>
                </div>
                {detailIncident.location && (
                  <div>
                    <p className="text-xs text-neutral-500">Lieu</p>
                    <p className="text-sm text-neutral-900">{detailIncident.location}</p>
                  </div>
                )}
              </div>

              {(workerNamesByIncidentId[detailIncident.id] ?? []).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-neutral-500">Travailleurs impliqués</p>
                  <div className="flex flex-wrap gap-3">
                    {(workerNamesByIncidentId[detailIncident.id] ?? []).map((name) => (
                      <div key={name} className="flex items-center gap-1.5">
                        <Avatar name={name} size={22} />
                        <span className="text-sm text-neutral-900">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-neutral-500">
                {new Date(detailIncident.created_at).toLocaleString('fr-TN')}
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

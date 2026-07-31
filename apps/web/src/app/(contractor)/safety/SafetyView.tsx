'use client';

import { ShieldWarningIcon } from '@phosphor-icons/react';
import { useState } from 'react';


import { IncidentFormModal } from './IncidentFormModal';
import { InsuranceFormModal } from './InsuranceFormModal';
import { PpeChecklistFormModal } from './PpeChecklistFormModal';
import { RiskAlertFormModal } from './RiskAlertFormModal';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';

type Incident = {
  id: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
  photo_url: string | null;
  created_at: string;
};
type Insurance = {
  id: string;
  provider_name: string;
  policy_number: string | null;
  expires_at: string | null;
  created_at: string;
};
type PpeChecklist = { id: string; item: string; compliant: boolean; created_at: string };
type RiskAlert = {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
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

const RISK_LABEL: Record<RiskAlert['severity'], string> = {
  low: 'Faible',
  medium: 'Moyen',
  high: 'Élevé',
};
const RISK_VARIANT: Record<RiskAlert['severity'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

type ActiveModule = 'none' | 'incidents' | 'insurance' | 'ppe' | 'risk';

export function SafetyView({
  incidents,
  insurances,
  ppeChecklists,
  riskAlerts,
}: {
  incidents: Incident[];
  insurances: Insurance[];
  ppeChecklists: PpeChecklist[];
  riskAlerts: RiskAlert[];
}) {
  const [activeModule, setActiveModule] = useState<ActiveModule>('none');
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  const [ppeModalOpen, setPpeModalOpen] = useState(false);
  const [riskModalOpen, setRiskModalOpen] = useState(false);

  const expiringSoonCount = insurances.filter((ins) => {
    if (!ins.expires_at) return false;
    const days = (new Date(ins.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  }).length;

  const nonCompliantCount = ppeChecklists.filter((p) => !p.compliant).length;
  const openRiskCount = riskAlerts.filter((r) => r.status === 'open').length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Compliance"
        title="Safety"
        description="Track incidents, PPE checks, site inspections, and risk alerts before they escalate."
      />

      <div className="grid gap-4 lg:grid-cols-4">
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
        <Card className="p-5" raised>
          <ShieldWarningIcon size={22} className="text-warning" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            PPE checklist
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {ppeChecklists.length === 0
              ? '—'
              : `${Math.round(((ppeChecklists.length - nonCompliantCount) / ppeChecklists.length) * 100)}%`}
          </p>
        </Card>
        <Card className="p-5" raised>
          <ShieldWarningIcon size={22} className="text-warning" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Risk alerts
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {openRiskCount}
          </p>
        </Card>
      </div>

      <SectionCard
        title="Safety modules"
        description="Core controls used on a live construction site."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

          <button
            onClick={() => setActiveModule('ppe')}
            className="bg-neutral-25 hover:border-accent-300 rounded-2xl border border-neutral-100 px-4 py-5 text-left transition-colors"
          >
            <p className="font-medium text-neutral-900">PPE checklist</p>
            <p className="mt-1 text-sm text-neutral-500">Vérifier la conformité des équipements.</p>
          </button>

          <button
            onClick={() => setActiveModule('risk')}
            className="bg-neutral-25 hover:border-accent-300 rounded-2xl border border-neutral-100 px-4 py-5 text-left transition-colors"
          >
            <p className="font-medium text-neutral-900">Risk alerts</p>
            <p className="mt-1 text-sm text-neutral-500">Signaler un risque sur le chantier.</p>
          </button>

          <div className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-5 opacity-60">
            <p className="font-medium text-neutral-900">Inspections</p>
            <p className="mt-1 text-sm text-neutral-500">Bientôt disponible.</p>
          </div>
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
                <div
                  key={inc.id}
                  className="flex items-center justify-between rounded-2xl border border-neutral-100 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-neutral-900">{inc.description}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(inc.created_at).toLocaleDateString('fr-TN')}
                    </p>
                  </div>
                  <StatusBadge variant={SEVERITY_VARIANT[inc.severity]}>
                    {SEVERITY_LABEL[inc.severity]}
                  </StatusBadge>
                </div>
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
                    <p className="text-sm text-neutral-900">{ins.provider_name}</p>
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

      {activeModule === 'ppe' && (
        <SectionCard
          title="PPE checklist"
          description="Vérifications de conformité des équipements de protection."
          actions={
            <button
              onClick={() => setPpeModalOpen(true)}
              className="text-accent-600 text-sm font-medium hover:underline"
            >
              + Ajouter une vérification
            </button>
          }
        >
          {ppeChecklists.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune vérification enregistrée.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {ppeChecklists.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border border-neutral-100 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-neutral-900">{p.item}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(p.created_at).toLocaleDateString('fr-TN')}
                    </p>
                  </div>
                  <StatusBadge variant={p.compliant ? 'success' : 'danger'}>
                    {p.compliant ? 'Conforme' : 'Non conforme'}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {activeModule === 'risk' && (
        <SectionCard
          title="Risk alerts"
          description="Alertes de risque sur les chantiers."
          actions={
            <button
              onClick={() => setRiskModalOpen(true)}
              className="text-accent-600 text-sm font-medium hover:underline"
            >
              + Signaler un risque
            </button>
          }
        >
          {riskAlerts.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune alerte enregistrée.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {riskAlerts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-2xl border border-neutral-100 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-neutral-900">{r.description}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(r.created_at).toLocaleDateString('fr-TN')}
                    </p>
                  </div>
                  <StatusBadge variant={RISK_VARIANT[r.severity]}>
                    {RISK_LABEL[r.severity]}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {incidentModalOpen && <IncidentFormModal onClose={() => setIncidentModalOpen(false)} />}
      {insuranceModalOpen && <InsuranceFormModal onClose={() => setInsuranceModalOpen(false)} />}
      {ppeModalOpen && <PpeChecklistFormModal onClose={() => setPpeModalOpen(false)} />}
      {riskModalOpen && <RiskAlertFormModal onClose={() => setRiskModalOpen(false)} />}
    </div>
  );
}

'use client';

import {
  Button,
  ConfirmTypingDialog,
  DataTable,
  type DataTableColumn,
  DetailHeader,
  ErrorState,
  IconActionButton,
  SectionCard,
  StatusBadge,
} from '@dala/ui-web';
import { BuildingsIcon, UserSwitchIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { NotesPanel } from '@/components/ui/NotesPanel';
import { useAdminSession } from '@/lib/use-admin-session';

const RESTORE_WINDOW_DAYS = 30;

// Mirrors apps/mobile's own organization-settings.tsx / create-organization.tsx
// label mappings exactly — same wording on both surfaces for the same
// underlying enum values, not a separately-invented admin vocabulary.
const VERIFICATION_LABEL: Record<string, string> = {
  unverified: 'Non vérifiée',
  pending: 'Vérification en cours',
  verified: 'Vérifiée',
};
const LEGAL_FORM_LABEL: Record<string, string> = {
  personne_physique: 'Personne physique',
  sarl: 'SARL',
  suarl: 'SUARL',
  sa: 'SA',
};
const WORKFORCE_BRACKET_LABEL: Record<string, string> = {
  '1': '1',
  '2_10': '2–10',
  '11_50': '11–50',
  '51_plus': '51+',
};
const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire',
  manager: 'Gestionnaire',
  viewer: 'Lecteur',
};

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { full_name: string } | null;
}

export function OrgDetail({ orgId }: { orgId: string }) {
  // Doc 04 §4.3 intro — same defense-in-depth pattern as
  // OrganizationsTable.tsx: UI gating here is never the real check, the
  // role gate in api/admin/organizations/[orgId]/route.ts is.
  const { data: session } = useAdminSession();
  const isSuperAdmin = session?.admin.role === 'super_admin';

  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  // Phase 20 (§1.7a) — `load()` already checked res.ok but did nothing
  // on failure, so `org` stayed null forever and the screen showed
  // "Chargement…" permanently on a real failure — indistinguishable
  // from still loading, with no retry.
  const [loadError, setLoadError] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<Member | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function load() {
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setOrg(data.organization);
      setMembers(data.members ?? []);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
  }, [orgId]);

  async function startImpersonation(reason: string) {
    if (!impersonateTarget) return;
    const res = await fetch('/api/admin/impersonate/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: impersonateTarget.user_id, orgId, reason }),
    });
    const data = await res.json();
    setImpersonateTarget(null);
    if (res.ok) {
      // Opens a new tab signed in as the target user via Supabase Auth's
      // own magic-link mechanism (Doc 04 §4.3.3a step 2) — this admin tab
      // keeps showing the impersonation banner/countdown independently.
      if (data.actionLink) window.open(data.actionLink, '_blank', 'noopener,noreferrer');
      window.location.reload();
    } else {
      alert(data.error ?? "Impossible de démarrer l'impersonation.");
    }
  }

  async function restoreOrg() {
    setRestoring(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "Impossible de restaurer l'organisation.");
      }
    } finally {
      setRestoring(false);
    }
  }

  // Audit fix 3b (Option B) — approve/reject the org's own verification
  // request. Same shape as restoreOrg above: no reason/confirmName check
  // (per the plan, typed confirmation is reserved for destructive
  // actions — approving or rejecting a self-serve request isn't one),
  // POST to the same mutation route, reload on success.
  async function verifyOrgAction(action: 'verify_org' | 'reject_org_verification') {
    setVerifying(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? 'Impossible de mettre à jour la vérification.');
      }
    } finally {
      setVerifying(false);
    }
  }

  if (loadError) return <ErrorState onRetry={() => void load()} />;
  if (!org) return <p className="text-sm text-neutral-500">Chargement…</p>;

  // Client-side only for the button's disabled state — restore_organization()
  // (0021) enforces the real 30-day cutoff server-side regardless.
  const deletedAt = org.deleted_at ? new Date(org.deleted_at) : null;
  const withinRestoreWindow = deletedAt
    ? Date.now() - deletedAt.getTime() < RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    : false;

  const columns: DataTableColumn<Member>[] = [
    { key: 'name', header: 'Nom', render: (m) => m.profiles?.full_name ?? m.user_id },
    {
      key: 'role',
      header: 'Rôle',
      render: (m) => <StatusBadge variant="neutral">{ROLE_LABEL[m.role] ?? m.role}</StatusBadge>,
    },
    {
      key: 'joined_at',
      header: 'Depuis',
      render: (m) => new Date(m.joined_at).toLocaleDateString('fr-FR'),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (m) => (
        <IconActionButton
          icon={UserSwitchIcon}
          label="Impersonate"
          tone="accent"
          onClick={() => setImpersonateTarget(m)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader
        backHref="/organizations"
        backLabel="Organisations"
        icon={BuildingsIcon}
        avatarUrl={org.logo_signed_url}
        title={org.name}
        status={
          org.deleted_at ? (
            <StatusBadge variant="danger">Supprimée (récupérable)</StatusBadge>
          ) : org.suspended_at ? (
            <StatusBadge variant="warning">Suspendue</StatusBadge>
          ) : (
            <StatusBadge variant="success">Active</StatusBadge>
          )
        }
        meta={[
          { label: 'Plan', value: org.plan },
          { label: "Type d'activité", value: org.trade_type ?? 'Non renseigné' },
          { label: 'Créée le', value: new Date(org.created_at).toLocaleDateString('fr-FR') },
        ]}
      />

      <SectionCard icon={BuildingsIcon} title="Informations générales">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">Plan</dt>
            <dd className="mt-1 text-neutral-900">{org.plan}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Type d'activité
            </dt>
            <dd className="mt-1 text-neutral-900">{org.trade_type ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">Statut</dt>
            <dd className="mt-1 flex items-center gap-3">
              {org.deleted_at && isSuperAdmin && (
                <Button
                  variant="secondary"
                  onClick={restoreOrg}
                  disabled={!withinRestoreWindow}
                  loading={restoring}
                  className="px-2.5 py-1 text-xs"
                >
                  Restaurer
                </Button>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">Créée le</dt>
            <dd className="mt-1 text-neutral-900">
              {new Date(org.created_at).toLocaleDateString('fr-FR')}
            </dd>
          </div>
        </dl>
      </SectionCard>

      {/* Org-creation-guide/gaps follow-on — these columns have existed
          since migration 0075 and this component's own /api/admin/
          organizations/[orgId] route already fetches them via
          select('*'), but nothing here ever rendered them. Read-only:
          admin has no write path for any of these (that's organization-
          settings.tsx's job on the org's own side), this is purely
          "let staff actually see what the org has filled in." */}
      <SectionCard icon={BuildingsIcon} title="Profil de l'entreprise">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Vérification
            </dt>
            <dd className="mt-1 flex items-center gap-3">
              <StatusBadge
                variant={
                  org.verification_status === 'verified'
                    ? 'success'
                    : org.verification_status === 'pending'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {VERIFICATION_LABEL[org.verification_status as string] ?? 'Non vérifiée'}
              </StatusBadge>
              {/* Audit fix 3b (Option B) — only actionable once the org
                  has actually requested it (verification_status =
                  'pending', via request_org_verification, 0089); an
                  unverified org with no pending request has nothing for
                  an admin to approve or reject yet. */}
              {org.verification_status === 'pending' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => verifyOrgAction('verify_org')}
                    loading={verifying}
                    className="px-2.5 py-1 text-xs"
                  >
                    Approuver
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => verifyOrgAction('reject_org_verification')}
                    loading={verifying}
                    className="px-2.5 py-1 text-xs"
                  >
                    Refuser
                  </Button>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Forme juridique
            </dt>
            <dd className="mt-1 text-neutral-900">
              {LEGAL_FORM_LABEL[org.legal_form as string] ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Taille de l&apos;équipe
            </dt>
            <dd className="mt-1 text-neutral-900">
              {WORKFORCE_BRACKET_LABEL[org.workforce_size_bracket as string] ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Matricule fiscal
            </dt>
            <dd className="mt-1 text-neutral-900">{org.matricule_fiscal ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Registre de commerce
            </dt>
            <dd className="mt-1 text-neutral-900">{org.rc_number ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">Adresse</dt>
            <dd className="mt-1 text-neutral-900">{org.address ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Zone d&apos;intervention
            </dt>
            <dd className="mt-1 text-neutral-900">{org.service_area ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
              Téléphone / e-mail
            </dt>
            <dd className="mt-1 text-neutral-900">
              {org.contact_phone ?? '—'} {org.contact_email ? `· ${org.contact_email}` : ''}
            </dd>
          </div>
          {(org.facebook_url || org.instagram_url || org.website_url) && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs font-semibold tracking-[0.04em] text-neutral-500">
                Liens publics
              </dt>
              <dd className="mt-1 flex flex-wrap gap-x-4 text-neutral-900">
                {org.facebook_url && (
                  <a
                    href={org.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-600 hover:underline"
                  >
                    Facebook
                  </a>
                )}
                {org.instagram_url && (
                  <a
                    href={org.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-600 hover:underline"
                  >
                    Instagram
                  </a>
                )}
                {org.website_url && (
                  <a
                    href={org.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-600 hover:underline"
                  >
                    Site web
                  </a>
                )}
              </dd>
            </div>
          )}
        </dl>
      </SectionCard>

      <SectionCard icon={UserSwitchIcon} title="Membres">
        <DataTable columns={columns} rows={members} getRowId={(m) => m.user_id} />
      </SectionCard>

      {/* Admin remediation Tier 4.8 */}
      <NotesPanel targetType="org" targetId={orgId} />

      {impersonateTarget && (
        <ConfirmTypingDialog
          title="Démarrer une impersonation"
          description="Doc 04 §4.3.3a — la session créée aura exactement les permissions de l'utilisateur cible, jamais plus. Le propriétaire de l'organisation sera notifié par email à la fin de la session."
          confirmValue={impersonateTarget.profiles?.full_name ?? impersonateTarget.user_id}
          confirmLabel="Démarrer"
          requireReason
          onConfirm={startImpersonation}
          onCancel={() => setImpersonateTarget(null)}
        />
      )}
    </div>
  );
}

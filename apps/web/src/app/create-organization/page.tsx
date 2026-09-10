'use client';

import type { OrganizationLegalForm, WorkforceSizeBracket } from '@dala/shared-types';
import { Button, Card, FormField } from '@dala/ui-web';
import { createOrganizationFullSchema } from '@dala/validation';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/app/create-organization/page.tsx
 *
 * Web parity for the mobile org-creation wizard (apps/mobile/src/app/
 * create-organization.tsx) — see docs/dala-web-org-creation-parity-guide.md
 * for the guide this was built from. Extended from the original
 * single-screen "name + trade_type" version into the same 4-step wizard
 * mobile already shipped: Essentials → Coordonnées → Informations légales
 * → Profil public. Same 3 RPCs, no signature changes
 * (create_organization_for_current_user, update_organization_profile,
 * update_organization_extended_profile) — RIB is never collected here,
 * same as mobile.
 *
 * TWO MODES, one page, same as mobile: CREATE (no `org_id` query param) or
 * COMPLETE-EXISTING (`?org_id=` present, reached from login/page.tsx's
 * post-login redirect for an incomplete org) — step 1 is skipped entirely
 * in the latter case and the form is pre-populated from the org's current
 * row.
 *
 * SAVE-AS-YOU-GO, same reasoning as mobile: every step's "Continuer"/
 * "Passer" persists the FULL accumulated state so far, not just that
 * step's own fields, so abandoning the wizard at any point after step 1
 * leaves a usable, actually-saved org.
 *
 * Web-specific differences from the mobile version (see the parity
 * guide's §2 for why): no Tamagui/native primitives — plain Tailwind
 * classes via this app's own Card/Button/FormField. No native image
 * picker — a plain <input type="file"> uploaded directly via the browser
 * Supabase client (apps/web has no reusable Storage-upload helper at all
 * before this — confirmed by checking, not assumed; journal/page.tsx only
 * ever SIGNS existing photos, never uploads). No bottom-sheet picker for
 * trade_type — kept as the free-text field the original page already
 * used. legal_form/workforce_size_bracket use a plain chip row (styled
 * buttons), mirroring mobile's own choice there over a <select>, since
 * both are closed CHECK-constrained enums, not free text.
 */

const LEGAL_FORM_OPTIONS: { value: OrganizationLegalForm; label: string }[] = [
  { value: 'personne_physique', label: 'Personne physique' },
  { value: 'sarl', label: 'SARL' },
  { value: 'suarl', label: 'SUARL' },
  { value: 'sa', label: 'SA' },
];

const WORKFORCE_BRACKET_OPTIONS: { value: WorkforceSizeBracket; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2_10', label: '2–10' },
  { value: '11_50', label: '11–50' },
  { value: '51_plus', label: '51+' },
];

const TOTAL_STEPS = 4;

interface WizardState {
  name: string;
  tradeType: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  logoPath: string | null;
  logoPreviewUrl: string | null;
  legalForm: OrganizationLegalForm | null;
  matriculeFiscal: string;
  rcNumber: string;
  workforceBracket: WorkforceSizeBracket | null;
  serviceArea: string;
  facebookUrl: string;
  instagramUrl: string;
  websiteUrl: string;
}

const EMPTY_STATE: WizardState = {
  name: '',
  tradeType: '',
  address: '',
  contactPhone: '',
  contactEmail: '',
  logoPath: null,
  logoPreviewUrl: null,
  legalForm: null,
  matriculeFiscal: '',
  rcNumber: '',
  workforceBracket: null,
  serviceArea: '',
  facebookUrl: '',
  instagramUrl: '',
  websiteUrl: '',
};

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'rounded-full border px-3.5 py-2 text-[13.5px] transition-colors',
              active
                ? 'border-accent-600 bg-accent-50 text-accent-700 font-semibold'
                : 'bg-neutral-0 border-neutral-300 text-neutral-700',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function CreateOrganizationPage() {
  return (
    <Suspense
      fallback={
        <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
          <p className="text-neutral-500">Chargement…</p>
        </main>
      }
    >
      <CreateOrganizationWizard />
    </Suspense>
  );
}

// useSearchParams() requires a Suspense boundary above it (Next.js App
// Router) — see this file's own header for the precedent this follows
// (apps/web/src/app/(contractor)/projects/page.tsx's ProjectsView split).
function CreateOrganizationWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingOrgId = searchParams.get('org_id');
  const isCompletingExisting = !!existingOrgId;

  const [step, setStep] = useState(isCompletingExisting ? 2 : 1);
  const [orgId, setOrgId] = useState<string | null>(existingOrgId);
  const [form, setForm] = useState<WizardState>(EMPTY_STATE);
  const [loadingExisting, setLoadingExisting] = useState(isCompletingExisting);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const loadExisting = useCallback(async () => {
    if (!existingOrgId) return;
    const supabase = createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select(
        'name, trade_type, address, contact_phone, contact_email, logo_url, legal_form, matricule_fiscal, rc_number, workforce_size_bracket, service_area, facebook_url, instagram_url, website_url',
      )
      .eq('id', existingOrgId)
      .maybeSingle();
    if (org) {
      let logoPreviewUrl: string | null = null;
      if (org.logo_url) {
        const { data: signed } = await supabase.storage
          .from('org-files')
          .createSignedUrl(org.logo_url, 3600);
        logoPreviewUrl = signed?.signedUrl ?? null;
      }
      setForm({
        name: org.name ?? '',
        tradeType: org.trade_type ?? '',
        address: org.address ?? '',
        contactPhone: org.contact_phone ?? '',
        contactEmail: org.contact_email ?? '',
        logoPath: org.logo_url ?? null,
        logoPreviewUrl,
        legalForm: org.legal_form ?? null,
        matriculeFiscal: org.matricule_fiscal ?? '',
        rcNumber: org.rc_number ?? '',
        workforceBracket: org.workforce_size_bracket ?? null,
        serviceArea: org.service_area ?? '',
        facebookUrl: org.facebook_url ?? '',
        instagramUrl: org.instagram_url ?? '',
        websiteUrl: org.website_url ?? '',
      });
    }
    setLoadingExisting(false);
  }, [existingOrgId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  // Step 1 — Essentials. Unchanged in spirit from the original page: same
  // RPC, same schema slice.
  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createOrganizationFullSchema
      .pick({ name: true, trade_type: true })
      .safeParse({ name: form.name, trade_type: form.tradeType || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: newOrgId, error: rpcError } = await supabase.rpc(
      'create_organization_for_current_user',
      { p_name: parsed.data.name, p_trade_type: parsed.data.trade_type ?? null },
    );
    setSaving(false);

    if (rpcError || !newOrgId) {
      setError(rpcError?.message ?? "Impossible de créer l'entreprise.");
      return;
    }

    setOrgId(newOrgId as string);
    setStep(2);
  }

  // Same save-as-you-go reasoning as the mobile wizard's own persistProfile
  // — resends the FULL accumulated state, called at the end of steps 2
  // and 3, so abandoning after either one still leaves those fields saved.
  async function persistProfile(): Promise<boolean> {
    if (!orgId) return false;
    const parsed = createOrganizationFullSchema
      .pick({
        name: true,
        trade_type: true,
        address: true,
        contact_phone: true,
        contact_email: true,
        matricule_fiscal: true,
        rc_number: true,
        logo_url: true,
      })
      .safeParse({
        name: form.name,
        trade_type: form.tradeType || undefined,
        address: form.address.trim() || undefined,
        contact_phone: form.contactPhone.trim() || undefined,
        contact_email: form.contactEmail.trim() || undefined,
        matricule_fiscal: form.matriculeFiscal.trim() || undefined,
        rc_number: form.rcNumber.trim() || undefined,
        logo_url: form.logoPath ?? undefined,
      });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return false;
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('update_organization_profile', {
      p_org_id: orgId,
      p_name: parsed.data.name,
      p_trade_type: parsed.data.trade_type ?? null,
      p_address: parsed.data.address ?? null,
      p_contact_phone: parsed.data.contact_phone ?? null,
      p_contact_email: parsed.data.contact_email ?? null,
      p_matricule_fiscal: parsed.data.matricule_fiscal ?? null,
      p_rc_number: parsed.data.rc_number ?? null,
      p_logo_url: parsed.data.logo_url ?? null,
    });
    if (rpcError) {
      setError('Impossible d\u2019enregistrer ces informations.');
      return false;
    }
    return true;
  }

  // Same reasoning, for update_organization_extended_profile — called at
  // the end of steps 3 (legal_form only, rest still null) and 4
  // (everything).
  async function persistExtendedProfile(): Promise<boolean> {
    if (!orgId) return false;
    const parsed = createOrganizationFullSchema
      .pick({
        legal_form: true,
        workforce_size_bracket: true,
        facebook_url: true,
        instagram_url: true,
        website_url: true,
        service_area: true,
      })
      .safeParse({
        legal_form: form.legalForm ?? undefined,
        workforce_size_bracket: form.workforceBracket ?? undefined,
        facebook_url: form.facebookUrl.trim(),
        instagram_url: form.instagramUrl.trim(),
        website_url: form.websiteUrl.trim(),
        service_area: form.serviceArea.trim() || undefined,
      });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return false;
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('update_organization_extended_profile', {
      p_org_id: orgId,
      p_legal_form: parsed.data.legal_form ?? null,
      p_workforce_size_bracket: parsed.data.workforce_size_bracket ?? null,
      p_facebook_url: parsed.data.facebook_url || null,
      p_instagram_url: parsed.data.instagram_url || null,
      p_website_url: parsed.data.website_url || null,
      p_service_area: parsed.data.service_area ?? null,
    });
    if (rpcError) {
      setError('Impossible d\u2019enregistrer ces informations.');
      return false;
    }
    return true;
  }

  async function handleStep2Next() {
    setError(null);
    setSaving(true);
    const ok = await persistProfile();
    setSaving(false);
    if (!ok) return;
    setStep(3);
  }

  async function handleStep3Next() {
    setError(null);
    setSaving(true);
    const okProfile = await persistProfile();
    const okExtended = okProfile && (await persistExtendedProfile());
    setSaving(false);
    if (!okProfile || !okExtended) return;
    setStep(4);
  }

  async function handleFinish() {
    setError(null);
    setSaving(true);
    const ok = await persistExtendedProfile();
    setSaving(false);
    if (!ok) return;
    router.push('/dashboard');
  }

  function handleFinishLater() {
    router.push('/dashboard');
  }

  // No reusable Storage-upload helper exists anywhere on apps/web (checked,
  // not assumed — journal/page.tsx only signs existing photos, never
  // uploads). Path shape matches uploadOrgFile's mobile convention exactly
  // (`${orgId}/logo/${uuid}.${ext}`) so a web-uploaded logo looks
  // identical, storage-wise, to a mobile-uploaded one.
  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    setUploadingLogo(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${orgId}/logo/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('org-files')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage.from('org-files').createSignedUrl(path, 3600);
      update('logoPath', path);
      update('logoPreviewUrl', signed?.signedUrl ?? null);
    } catch {
      setError("Impossible d'ajouter le logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loadingExisting) {
    return (
      <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
        <p className="text-neutral-500">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md p-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="font-display text-[23px] font-semibold text-neutral-900">
            {isCompletingExisting ? 'Compléter votre profil' : 'Nouvelle entreprise'}
          </h1>
          <span className="text-sm text-neutral-500">
            Étape {step} sur {TOTAL_STEPS}
          </span>
        </div>

        {/* Step indicator — dots, not a field-count progress bar: steps
            2-4 are all skippable (same reasoning as the mobile wizard). */}
        <div className="mb-6 mt-3 flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={[
                'h-1 flex-1 rounded-full',
                s <= step ? 'bg-accent-600' : 'bg-neutral-200',
              ].join(' ')}
            />
          ))}
        </div>

        {step === 1 && (
          <form onSubmit={handleCreateOrg} className="flex flex-col gap-4">
            <p className="text-sm text-neutral-500">Vous en serez le propriétaire (owner).</p>
            <FormField
              label="Nom de l'entreprise"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
            <FormField
              label="Type d'activité (optionnel)"
              value={form.tradeType}
              onChange={(e) => update('tradeType', e.target.value)}
              placeholder="Plomberie, électricité…"
            />
            {error && <p className="text-danger text-sm">{error}</p>}
            <Button type="submit" fullWidth loading={saving} className="mt-2">
              Continuer
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-500">
              Coordonnées de l&apos;entreprise — tout est facultatif, vous pourrez les compléter
              plus tard.
            </p>
            <FormField
              label="Adresse"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
            />
            <FormField
              label="Téléphone de contact"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => update('contactPhone', e.target.value)}
            />
            <FormField
              label="E-mail de contact"
              type="email"
              value={form.contactEmail}
              onChange={(e) => update('contactEmail', e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">Logo</label>
              <div className="flex items-center gap-3">
                {form.logoPreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoPreviewUrl}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                )}
                <label className="rounded-control bg-neutral-0 cursor-pointer border border-neutral-300 px-3.5 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
                  {uploadingLogo ? 'Envoi…' : form.logoPath ? 'Changer le logo' : 'Ajouter un logo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={(e) => void handleLogoChange(e)}
                  />
                </label>
              </div>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}
            <div className="mt-2 flex gap-2.5">
              <Button variant="secondary" onClick={() => setStep(3)}>
                Passer
              </Button>
              <Button fullWidth loading={saving} onClick={() => void handleStep2Next()}>
                Continuer
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-500">
              Informations légales — visibles uniquement par vous et votre équipe.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">Forme juridique</label>
              <ChipRow
                options={LEGAL_FORM_OPTIONS}
                value={form.legalForm}
                onChange={(v) => update('legalForm', v)}
              />
            </div>
            <FormField
              label="Matricule fiscal"
              value={form.matriculeFiscal}
              onChange={(e) => update('matriculeFiscal', e.target.value)}
            />
            <FormField
              label="Registre de commerce"
              value={form.rcNumber}
              onChange={(e) => update('rcNumber', e.target.value)}
            />

            {error && <p className="text-danger text-sm">{error}</p>}
            <div className="mt-2 flex gap-2.5">
              <Button variant="secondary" onClick={() => setStep(4)}>
                Passer
              </Button>
              <Button fullWidth loading={saving} onClick={() => void handleStep3Next()}>
                Continuer
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-500">
              Profil public — utilisé pour votre visibilité auprès de nouveaux clients.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">
                Taille de l&apos;équipe
              </label>
              <ChipRow
                options={WORKFORCE_BRACKET_OPTIONS}
                value={form.workforceBracket}
                onChange={(v) => update('workforceBracket', v)}
              />
            </div>
            <FormField
              label="Zone d'intervention"
              value={form.serviceArea}
              onChange={(e) => update('serviceArea', e.target.value)}
            />
            <FormField
              label="Facebook"
              value={form.facebookUrl}
              onChange={(e) => update('facebookUrl', e.target.value)}
            />
            <FormField
              label="Instagram"
              value={form.instagramUrl}
              onChange={(e) => update('instagramUrl', e.target.value)}
            />
            <FormField
              label="Site web"
              value={form.websiteUrl}
              onChange={(e) => update('websiteUrl', e.target.value)}
            />

            {error && <p className="text-danger text-sm">{error}</p>}
            <div className="mt-2 flex gap-2.5">
              <Button variant="secondary" onClick={() => void handleFinish()}>
                Passer
              </Button>
              <Button fullWidth loading={saving} onClick={() => void handleFinish()}>
                Terminer
              </Button>
            </div>
          </div>
        )}

        {step > 1 && (
          <button
            type="button"
            onClick={handleFinishLater}
            className="hover:text-accent-600 mt-4 w-full text-center text-sm text-neutral-500"
          >
            Terminer plus tard
          </button>
        )}
      </Card>
    </main>
  );
}

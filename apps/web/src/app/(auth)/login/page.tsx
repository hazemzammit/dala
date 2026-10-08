'use client';

import { AuthSplitPanel, Button, FormField } from '@dala/ui-web';
import { loginSchema } from '@dala/validation';
import {
  BuildingsIcon,
  ChartBarIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  TruckIcon,
  UsersThreeIcon,
  WalletIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import logo from '../../../../assets/logo.png';


/**
 * Doc 04 §4.1.3 — Log In (web). TODO before shipping: surface the
 * 5-failed-attempts lockout messaging (Doc 01 §1.3.8) — not wired up yet.
 *
 * Org-creation-guide/web-parity follow-on — post-login completion
 * redirect, mirroring apps/mobile/src/app/login.tsx exactly (same 5-field
 * completion calc: logo, legal_form, workforce_size_bracket, service_area,
 * matricule_fiscal; same org_checklist_dismissed_at gate organization-
 * settings.tsx's/mobile's own checklist already uses — not a second,
 * separate "have we nagged this person" flag). No `next`-param destination
 * exists on this screen today (checked — unlike mobile, web has no
 * existing redirect-elsewhere flow this could clobber), so this always
 * applies when the active org is incomplete and not dismissed.
 */
async function getIncompleteOrgRedirect(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select(
      'logo_url, legal_form, workforce_size_bracket, service_area, matricule_fiscal, org_checklist_dismissed_at',
    )
    .eq('id', profile.active_org_id)
    .maybeSingle();
  if (!org || org.org_checklist_dismissed_at) return null;

  const checks = [
    !!org.logo_url,
    !!org.legal_form,
    !!org.workforce_size_bracket,
    !!org.service_area?.trim(),
    !!org.matricule_fiscal?.trim(),
  ];
  const completion = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  if (completion >= 100) return null;

  return `/create-organization?org_id=${profile.active_org_id}`;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    const redirect = await getIncompleteOrgRedirect(supabase);
    window.location.href = redirect ?? '/dashboard';
  }

  return (
    <main className="bg-neutral-0 flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <Image src={logo} alt="Dala" className="h-9 w-auto" priority />

          <h1 className="font-display mt-8 text-[26px] font-semibold leading-[1.25] text-neutral-900">
            Bon retour !
            <br />
            <span className="text-accent-600">Connectez-vous à votre espace.</span>
          </h1>
          <p className="mt-3 text-sm text-neutral-500">
            Gérez vos chantiers, vos équipes et toute votre activité en un seul endroit.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <FormField
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
            />

            <FormField
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Votre mot de passe"
              required
            />

            {error && <p className="text-danger text-sm">{error}</p>}

            <Button type="submit" fullWidth loading={loading} className="mt-2">
              Se connecter
            </Button>

            <div className="flex items-center justify-between text-sm">
              <a href="/forgot-password" className="hover:text-accent-600 text-neutral-500">
                Mot de passe oublié ?
              </a>
              <a href="/sign-up" className="hover:text-accent-600 text-neutral-500">
                Créer un compte
              </a>
            </div>
          </form>

          <p className="mt-10 flex items-center gap-1.5 text-xs text-neutral-400">
            <ShieldCheckIcon size={14} />
            Vos données sont sécurisées et chiffrées.
          </p>
        </div>
      </div>

      <AuthSplitPanel
        eyebrow="Plus qu'un outil"
        title={
          <>
            Une plateforme
            <br />
            pour construire demain.
          </>
        }
        features={[
          { icon: <BuildingsIcon size={18} />, label: 'Chantiers & projets' },
          { icon: <ReceiptIcon size={18} />, label: 'Suivi des dépenses' },
          { icon: <UsersThreeIcon size={18} />, label: 'Équipes & pointage' },
          { icon: <ChartBarIcon size={18} />, label: 'Rapports & statistiques' },
          { icon: <WalletIcon size={18} />, label: 'Paie & avances' },
          { icon: <TruckIcon size={18} />, label: 'Matériel & véhicules' },
        ]}
      />
    </main>
  );
}

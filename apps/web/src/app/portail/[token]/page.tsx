'use client';

import { Button, Card, EmptyState, ErrorState, FormField, StatusBadge } from '@dala/ui-web';
import { DownloadSimpleIcon, HandshakeIcon, LockIcon } from '@phosphor-icons/react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/app/portail/[token]/page.tsx
 *
 * IMPROVEMENT-PLAN PHASE 9 §2.5 "Client-facing invoicing" — this is the
 * page half of that item, and the bigger of the two findings this
 * migration's Part 2 header documents in full: there was NO client-
 * facing portal page anywhere in this repo before this phase. Confirmed
 * by reading both existing candidates before writing this — mobile's
 * `client-portal.tsx` is the CONTRACTOR's admin screen (says so in its
 * own header), and this exact route
 * (`apps/web/src/app/(contractor)/client-portal/`) is a different,
 * unrelated placeholder under the CONTRACTOR route group, not this one.
 * `https://app.dala.tn/portail/{token}` — the URL mobile's own
 * `handleCopyLink()` already generates and hands to a contractor to
 * share — pointed at nothing until this page existed.
 *
 * ANONYMOUS BY DESIGN: a client has no Supabase session, no
 * `organization_members` row, nothing RLS can key off. Every read here
 * goes through `verify_client_portal_access()` / a POST to
 * `generate-invoice-pdf` with `{ token, pin }` in the body (migration
 * 0074) — SECURITY DEFINER functions that do their own token+PIN
 * verification and lockout bookkeeping, not raw table reads. The browser
 * client below is the plain ANON-key client (`createClient()`,
 * apps/web/src/lib/supabase/client.ts) — never a service-role key on the
 * client, same rule Doc 01 §1.6 already states for every other web
 * screen.
 *
 * PIN state machine: 'loading' -> 'pin_required' (portal has a PIN set,
 * none/wrong one supplied yet) -> 'ok' (verified, view rendered) — or
 * 'locked'/'not_found' as terminal error states. A portal with NO PIN set
 * (`pin_enabled = false`) skips straight from 'loading' to 'ok' — the RPC
 * itself decides this (see verify_client_portal_access's own branching in
 * migration 0074, not re-decided here).
 *
 * IMPROVEMENT-PLAN PHASE 11 (§9.5) — design pass. Read this file in full
 * before touching it, per this phase's own instruction — this is the ONE
 * client-facing surface Phase 9 already shipped, so this is polish, not a
 * green field. Also read what branding already reached this page before
 * changing anything: `verify_client_portal_access()` (0074) returned
 * NOTHING from `organizations` at all (confirmed by reading its return
 * shape directly) despite §1.4's logo work shipping everywhere else
 * (switcher, dashboard, PDF reports) back in Phase 2/5 — this page was
 * the one gap. Migration 0076 (this phase) adds `org_name`/`org_logo_url`
 * to that RPC's response and a narrow `get_org_logo_signed_url(token)`
 * RPC this page calls once, after verification succeeds, to mint the
 * logo's signed URL (the RPC returns a bare storage PATH, never a direct
 * URL — Doc 01 §1.3.11 — same as every other logo read in this codebase).
 *
 * DESIGN DECISIONS, disclosed rather than left implicit:
 *   - Typography: this page now sets its own display face — a system
 *     serif stack (ui-serif/Georgia/Cambria/Times New Roman/serif, see
 *     `.portal-display` in globals.css) — DELIBERATELY NOT Sora, the
 *     internal app's own `font-display` token used on every contractor-
 *     facing screen. §9.5's own wording asks for "typography/branding
 *     independent of the internal app's utilitarian style" — reusing
 *     Sora here would read as the same product wearing a different hat,
 *     not a distinct client-facing document. A serif for a budget/
 *     invoice summary also borrows the register of a formal statement
 *     or a printed report, which is closer to what this page actually
 *     is to a client than a SaaS dashboard reads as.
 *   - No web-font is LOADED for this — a system serif stack only. This
 *     is itself the "graceful degradation on an older device" decision
 *     §9.5 asks for: a client opening this link is very likely on
 *     whatever phone they have, possibly on a slow connection, with no
 *     reason to have this app installed — blocking on a webfont
 *     download (or worse, a layout-shifting FOUT/FOIT) for a page they
 *     open once is a worse trade than "not quite the exact intended
 *     serif" on an older device that substitutes its own system serif.
 *   - Background: a warm off-white (`--portal-bg`, globals.css) distinct
 *     from the internal app's own cooler `neutral-25` — small, low-risk,
 *     and reinforces "this is a different surface" without needing a
 *     new color in the shared token system (a client-only background
 *     shade isn't something any other screen needs, so it's scoped to
 *     this page's own CSS rather than added to `@dala/design-tokens`).
 *   - Org branding: a header bar showing the org's logo (if one is set)
 *     or a plain letter-monogram fallback (if not) + the org name, above
 *     the project title. Graceful degradation again: a logo that fails
 *     to load, or an org with none set, never breaks the page layout —
 *     the monogram is a real fallback, not a broken-image icon.
 *   - Copy: "Portail client" (a system-facing label — a client doesn't
 *     think of themselves as being "in a portal") replaced with a
 *     plainer "Suivi de votre chantier"; the budget bar gets one added
 *     sentence in plain language for a reader who isn't a contractor and
 *     may not otherwise know what "budget consommé" means for them.
 */

interface Invoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string;
  subtotal: number;
}

interface PortalView {
  project_name: string;
  project_status: string;
  budget_total: number | null;
  budget_consumed: number;
  invoices: Invoice[];
  // Phase 11 §9.5 — org branding (migration 0076).
  org_name: string | null;
  org_logo_url: string | null; // storage path, not a direct URL — see file header.
}

type ViewState = 'loading' | 'pin_required' | 'locked' | 'not_found' | 'error' | 'ok';

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'En cours',
  completed: 'Terminé',
  archived: 'Archivé',
};

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<ViewState>('loading');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<PortalView | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Phase 11 §9.5 — signed logo URL, minted once verification succeeds.
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  async function verify(pinAttempt: string | null) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('verify_client_portal_access', {
      p_token: token,
      p_pin: pinAttempt,
    });
    if (error) {
      // Phase 20 (§1.7a) — previously mapped straight to 'not_found',
      // which told an anonymous client their link was invalid/disabled
      // on what may have just been a transient network failure. A
      // genuinely bad token still reaches 'not_found' below, via the
      // RPC's own `default` case (a real response with an unrecognized
      // status) — this only catches the RPC call itself failing.
      setState('error');
      return;
    }
    switch (data?.status) {
      case 'ok':
        setView(data as PortalView);
        setState('ok');
        // Phase 11 §9.5 — mint the logo's signed URL only once we're past
        // the token/PIN gate, and only if the org actually has one set
        // (a real fallback — the letter-monogram below — covers the
        // "no logo" and "mint failed" cases without breaking the page).
        if ((data as PortalView).org_logo_url) {
          void Promise.resolve(supabase.rpc('get_org_logo_signed_url', { p_token: token }))
            .then(({ data: url }: { data: string | null }) => {
              if (url) setLogoSignedUrl(url);
              else setLogoFailed(true);
            })
            .catch(() => setLogoFailed(true));
        }
        break;
      case 'locked':
        setState('locked');
        break;
      case 'pin_required':
        setState('pin_required');
        if (pinAttempt !== null) {
          // A pin_required response AFTER an attempt means the attempt
          // was wrong (a null-pin first load also returns pin_required,
          // but with no attempt to have been wrong about — no error
          // shown in that case).
          setPinError('Code incorrect. Réessayez.');
        }
        break;
      default:
        setState('not_found');
    }
  }

  useEffect(() => {
    if (token) void verify(null);
    // Runs once per token, mirroring every other token-driven page in this app
    // (accept-invite.tsx's mobile equivalent has the same shape).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    setSubmitting(true);
    await verify(pin);
    setSubmitting(false);
  }

  async function handleDownload(invoiceId: string) {
    setDownloadingId(invoiceId);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-invoice-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ token, pin: pin || null, invoice_id: invoiceId }),
        },
      );
      if (!response.ok) throw new Error('download_failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // A download failing here (e.g. the portal's PIN lockout kicked in
      // between page load and this click) shouldn't crash the page —
      // the person can just retry, same as any other transient web
      // download failure.
      setPinError('Téléchargement impossible. Réessayez.');
    } finally {
      setDownloadingId(null);
    }
  }

  if (state === 'loading') {
    return (
      <main className="portal-bg flex min-h-screen items-center justify-center px-6">
        <p className="text-neutral-500">Chargement…</p>
      </main>
    );
  }

  if (state === 'not_found') {
    return (
      <main className="portal-bg flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={HandshakeIcon}
          title="Lien invalide"
          description="Ce lien de portail client n'existe pas ou a été désactivé. Contactez votre entrepreneur pour un nouveau lien."
        />
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="portal-bg flex min-h-screen items-center justify-center px-6">
        <ErrorState onRetry={() => void verify(null)} />
      </main>
    );
  }

  if (state === 'locked') {
    return (
      <main className="portal-bg flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={LockIcon}
          title="Accès temporairement bloqué"
          description="Trop de tentatives incorrectes. Réessayez dans quelques minutes."
        />
      </main>
    );
  }

  if (state === 'pin_required') {
    return (
      <main className="portal-bg flex min-h-screen items-center justify-center px-6">
        <Card className="w-full max-w-sm p-8">
          <h1 className="portal-display text-[20px] font-semibold text-neutral-900">
            Code d&apos;accès requis
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Saisissez le code fourni par votre entrepreneur pour consulter votre chantier.
          </p>
          <form onSubmit={handlePinSubmit} className="mt-6 flex flex-col gap-4">
            <FormField
              label="Code"
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              required
            />
            {pinError && <p className="text-danger text-sm">{pinError}</p>}
            <Button type="submit" fullWidth loading={submitting}>
              Accéder
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  // state === 'ok'
  const consumedPct =
    view!.budget_total && view!.budget_total > 0
      ? Math.min(100, Math.round((view!.budget_consumed / view!.budget_total) * 100))
      : null;

  // Phase 11 §9.5 — letter-monogram fallback when no logo is set (or one
  // failed to load/mint) — a real fallback, never a broken-image icon.
  const orgInitial = (view!.org_name ?? 'D').trim().charAt(0).toUpperCase() || 'D';
  const showLogo = view!.org_logo_url && logoSignedUrl && !logoFailed;

  return (
    <main className="portal-bg min-h-screen px-6 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {/* Phase 11 §9.5 — org branding header, distinct from the internal
            app's own switcher/header treatment (see file header for the
            full design reasoning). */}
        <div className="flex items-center gap-3">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a
            // signed Storage URL, not a static asset next/image can
            // optimize; matches every other signed-logo <img> in this
            // codebase (same reasoning as the PDF/report logo embeds).
            <img
              src={logoSignedUrl}
              alt={view!.org_name ?? 'Logo'}
              className="h-12 w-12 rounded-full object-cover"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className="bg-accent-600 flex h-12 w-12 items-center justify-center rounded-full">
              <span className="portal-display text-lg font-semibold text-white">{orgInitial}</span>
            </div>
          )}
          {view!.org_name && (
            <p className="text-sm font-medium text-neutral-500">{view!.org_name}</p>
          )}
        </div>

        <div>
          <p className="text-accent-600 text-sm font-medium">Suivi de votre chantier</p>
          <h1 className="portal-display mt-1 text-[28px] font-semibold text-neutral-900">
            {view!.project_name}
          </h1>
          <div className="mt-2">
            <StatusBadge variant={view!.project_status === 'active' ? 'info' : 'neutral'}>
              {PROJECT_STATUS_LABELS[view!.project_status] ?? view!.project_status}
            </StatusBadge>
          </div>
        </div>

        {view!.budget_total !== null && (
          <Card className="p-6">
            <h2 className="portal-display text-base font-semibold text-neutral-900">
              Avancement budgétaire
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Montant déjà dépensé sur le budget prévu pour ce chantier.
            </p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="bg-accent-600 h-full rounded-full"
                style={{ width: `${consumedPct ?? 0}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {view!.budget_consumed.toFixed(2)} TND sur {view!.budget_total.toFixed(2)} TND
              {consumedPct !== null ? ` (${consumedPct}%)` : ''}
            </p>
          </Card>
        )}

        <Card className="p-6">
          <h2 className="portal-display text-base font-semibold text-neutral-900">Factures</h2>
          {view!.invoices.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Aucune facture pour le moment.</p>
          ) : (
            <div className="mt-3 flex flex-col divide-y divide-neutral-100">
              {view!.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{inv.invoice_number}</p>
                    <p className="text-xs text-neutral-500">
                      Émise le {inv.issued_at} — échéance {inv.due_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-neutral-900">
                      {Number(inv.subtotal).toFixed(2)} TND
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() => handleDownload(inv.id)}
                      loading={downloadingId === inv.id}
                      aria-label={`Télécharger ${inv.invoice_number}`}
                    >
                      <DownloadSimpleIcon size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <p className="pb-4 text-center text-xs text-neutral-500">
          Propulsé par Dala — la base de tout chantier.
        </p>
      </div>
    </main>
  );
}

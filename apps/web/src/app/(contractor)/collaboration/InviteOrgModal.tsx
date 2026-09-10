'use client';

import { Button, Card, FormField } from '@dala/ui-web';
import { CheckCircleIcon, XIcon } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';

import { createProjectInvitation } from './actions';

import { useAsyncTransition } from '@/lib/useAsyncTransition';

type Project = { id: string; name: string };

/**
 * FLAGGED FOR HAZEM — rewritten against the real schema. The collaborator's
 * original version collected `invited_org_name` (no such column — the
 * table has no name field at all, only phone/email/trade_type) and `role`
 * (also no such column — a collaborating org's role on the project is set
 * later, at accept time, via accept_project_invitation, not at invite
 * time). Also dropped the "copy invite link" UI: unlike worker invites,
 * `invite_org_to_project` generates its OWN token server-side and doesn't
 * return it to the caller — there's nothing to copy for the 'email'
 * channel since send-project-invitation-email already delivers it
 * directly. whatsapp/sms still have no delivery wired (same disclosed gap
 * as worker invites), so those two channels just confirm the row was
 * created with a note that manual follow-up is needed.
 */
export function InviteOrgModal({
  projects,
  onClose,
}: {
  projects: Project[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [contactMethod, setContactMethod] = useState<'phone' | 'email'>('email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tradeType, setTradeType] = useState('');
  const [sentVia, setSentVia] = useState<'email' | 'whatsapp' | 'sms'>('email');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ emailWarning: string | null } | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (contactMethod === 'phone' && phone.trim().length < 8) {
      setError('Numéro de téléphone invalide.');
      return;
    }
    if (contactMethod === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Adresse e-mail invalide.');
      return;
    }

    startTransition(async () => {
      const result = await createProjectInvitation({
        project_id: projectId,
        invited_phone: contactMethod === 'phone' ? phone : undefined,
        invited_email: contactMethod === 'email' ? email : undefined,
        trade_type: tradeType || undefined,
        sent_via: sentVia,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      setDone({ emailWarning: result.emailWarning });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {done ? 'Invitation envoyée' : 'Inviter une entreprise'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col gap-4">
            <div className="bg-success/10 flex items-start gap-2.5 rounded-lg p-3">
              <CheckCircleIcon size={18} className="text-success mt-0.5 shrink-0" />
              <p className="text-sm text-neutral-900">
                {sentVia === 'email'
                  ? (done.emailWarning ?? 'Invitation envoyée par e-mail.')
                  : 'Invitation créée. L’envoi automatique par SMS/WhatsApp n’est pas encore branché — contactez l’entreprise manuellement.'}
              </p>
            </div>
            <div className="mt-2 flex justify-end">
              <Button onClick={onClose}>Terminer</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">Chantier</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">Contact</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setContactMethod('email')}
                  className={`rounded-control flex-1 border px-3 py-2 text-sm ${contactMethod === 'email' ? 'border-accent-600 bg-accent-50' : 'border-neutral-300'}`}
                >
                  E-mail
                </button>
                <button
                  type="button"
                  onClick={() => setContactMethod('phone')}
                  className={`rounded-control flex-1 border px-3 py-2 text-sm ${contactMethod === 'phone' ? 'border-accent-600 bg-accent-50' : 'border-neutral-300'}`}
                >
                  Téléphone
                </button>
              </div>
            </div>

            {contactMethod === 'email' ? (
              <FormField
                label="E-mail de l'entreprise"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex. contact@electricite-bs.tn"
                required
              />
            ) : (
              <FormField
                label="Téléphone de contact"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex. 27 123 456"
                required
              />
            )}

            <FormField
              label="Corps de métier (facultatif)"
              value={tradeType}
              onChange={(e) => setTradeType(e.target.value)}
              placeholder="Ex. Électricité"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">
                Canal d&apos;invitation
              </label>
              <select
                value={sentVia}
                onChange={(e) => setSentVia(e.target.value as 'email' | 'whatsapp' | 'sms')}
                className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
              >
                <option value="email">E-mail (envoi automatique)</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" loading={isPending}>
                Inviter
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

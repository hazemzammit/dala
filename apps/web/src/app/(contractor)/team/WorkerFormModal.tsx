'use client';

import type { InvitationChannel, Worker } from '@dala/shared-types';
import { Button, Card, FormField } from '@dala/ui-web';
import { CheckCircleIcon, CopyIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { inviteWorker, updateWorker } from './actions';

import { useAsyncTransition } from '@/lib/useAsyncTransition';

const CHANNEL_OPTIONS: { value: InvitationChannel; label: string }[] = [
  { value: 'app', label: 'Application (le lien s\u2019affiche ci-dessous)' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
];

export function WorkerFormModal({ onClose, worker }: { onClose: () => void; worker?: Worker }) {
  const isEdit = !!worker;
  const [fullName, setFullName] = useState(worker?.full_name ?? '');
  const [email, setEmail] = useState(worker?.email ?? '');
  const [phone, setPhone] = useState(worker?.phone ?? '');
  const [trade, setTrade] = useState(worker?.trade ?? '');
  const [dailyRate, setDailyRate] = useState(worker?.daily_rate?.toString() ?? '');
  const [channel, setChannel] = useState<InvitationChannel>('app');
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useAsyncTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (fullName.trim().length < 2 || phone.trim().length < 8) {
      setError('Vérifiez le nom complet et le numéro de téléphone.');
      return;
    }
    if (!isEdit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Merci d’indiquer une adresse e-mail valide.');
      return;
    }

    startTransition(async () => {
      if (isEdit && worker) {
        const result = await updateWorker({
          id: worker.id,
          full_name: fullName,
          phone,
          trade: trade || undefined,
          daily_rate: dailyRate ? Number(dailyRate) : undefined,
        });

        if (!result.success) {
          setError(result.error);
          return;
        }

        onClose();
        return;
      }

      const result = await inviteWorker({
        full_name: fullName,
        email,
        phone,
        trade: trade || undefined,
        daily_rate: dailyRate ? Number(dailyRate) : undefined,
        channel,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      // Doc 06 §6.6/6.8 — pas d'envoi SMS/WhatsApp réel branché ; on affiche
      // le lien pour copier-coller manuellement plutôt que de fermer la
      // modal silencieusement (voir commentaire dans actions.ts).
      setInviteLink(result.inviteLink ?? null);
    });
  }

  function handleCopy() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {isEdit ? 'Modifier un ouvrier' : inviteLink ? 'Ouvrier ajouté' : 'Inviter un ouvrier'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        {inviteLink ? (
          <div className="flex flex-col gap-4">
            <div className="bg-success/10 flex items-start gap-2.5 rounded-lg p-3">
              <CheckCircleIcon size={18} className="text-success mt-0.5 shrink-0" />
              <p className="text-sm text-neutral-900">
                {fullName} a été ajouté(e). L&apos;envoi automatique par SMS/WhatsApp n&apos;est pas
                encore branché — copiez le lien ci-dessous pour l&apos;envoyer manuellement.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <code className="rounded-control flex-1 truncate border border-neutral-300 bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
                {inviteLink}
              </code>
              <button
                onClick={handleCopy}
                className="rounded-control border border-neutral-300 p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Copier le lien"
              >
                <CopyIcon size={16} />
              </button>
            </div>
            {copied && <p className="text-success text-sm">Lien copié !</p>}

            <div className="mt-2 flex justify-end">
              <Button onClick={onClose}>Terminer</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              label="Nom complet"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex. Ali Ben Salah"
              required
            />
            {!isEdit && (
              <FormField
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex. ali.bensalah@example.com"
                required
              />
            )}
            <FormField
              label="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex. 27 123 456"
              required
            />
            <FormField
              label="Corps de métier"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              placeholder="Ex. Maçon"
            />
            <FormField
              label="Taux journalier (TND)"
              type="number"
              min={0}
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              placeholder="Ex. 60"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">
                Canal d&apos;invitation
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as InvitationChannel)}
                className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
              >
                {CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" loading={isPending}>
                {isEdit ? 'Enregistrer' : 'Inviter'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

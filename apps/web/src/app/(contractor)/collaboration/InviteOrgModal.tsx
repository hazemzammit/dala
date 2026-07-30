'use client';

import { CheckCircleIcon, CopyIcon, XIcon } from '@phosphor-icons/react';
import { useState, useTransition } from 'react';

import { createProjectInvitation } from './actions';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';


type Project = { id: string; name: string };

export function InviteOrgModal({
  projects,
  onClose,
}: {
  projects: Project[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [orgName, setOrgName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'trade' | 'client'>('trade');
  const [channel, setChannel] = useState<'app' | 'whatsapp' | 'sms'>('app');
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (orgName.trim().length < 2 || phone.trim().length < 8) {
      setError("Vérifiez le nom de l'entreprise et le numéro de téléphone.");
      return;
    }

    startTransition(async () => {
      const result = await createProjectInvitation({
        project_id: projectId,
        invited_org_name: orgName,
        invited_contact_phone: phone,
        role,
        channel,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      setInviteLink(result.inviteLink);
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
            {inviteLink ? 'Invitation créée' : 'Inviter une entreprise'}
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
                Invitation créée pour {orgName}. L&apos;envoi automatique par SMS/WhatsApp
                n&apos;est pas encore branché — copiez le lien pour l&apos;envoyer manuellement.
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

            <FormField
              label="Nom de l'entreprise"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Ex. Électricité Ben Salah"
              required
            />
            <FormField
              label="Téléphone de contact"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex. 27 123 456"
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">Rôle sur le chantier</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'trade' | 'client')}
                className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
              >
                <option value="trade">Corps de métier</option>
                <option value="client">Client</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-900">
                Canal d&apos;invitation
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as 'app' | 'whatsapp' | 'sms')}
                className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
              >
                <option value="app">Application (lien affiché ci-dessous)</option>
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

'use client';

import { Button, FormField, SectionCard } from '@dala/ui-web';
import { useEffect, useState } from 'react';

type TargetType = 'all_users' | 'owners_only' | 'by_plan' | 'by_trade_type' | 'inactive_30d';

const TARGET_LABELS: Record<TargetType, string> = {
  all_users: 'Tous les utilisateurs',
  owners_only: 'Propriétaires uniquement',
  by_plan: 'Par plan',
  by_trade_type: "Par type d'activité",
  inactive_30d: 'Inactifs 30+ jours',
};

const CHANNELS = [
  { value: 'in_app', label: 'Bannière in-app' },
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
] as const;

export function AnnouncementForm({ onPublished }: { onPublished: () => void }) {
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<string[]>(['in_app']);
  const [targetType, setTargetType] = useState<TargetType>('all_users');
  const [targetValue, setTargetValue] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ estimate: '1', targetType });
    if (targetValue) params.set('targetValue', targetValue);
    fetch(`/api/admin/announcements?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setEstimate(typeof data.count === 'number' ? data.count : null));
  }, [targetType, targetValue]);

  function toggleChannel(value: string) {
    setChannels((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          channels,
          targetType,
          targetValue: targetValue || null,
          scheduledFor: scheduledFor || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Envoi impossible.');
        return;
      }
      setMessage('');
      onPublished();
    } finally {
      setSubmitting(false);
    }
  }

  const needsTargetValue = targetType === 'by_plan' || targetType === 'by_trade_type';

  // Phase 5 (plan §5.13) — compose-form Card becomes a tone-less
  // SectionCard (Level-1 surface per Phase 4.6) titled "Nouvelle annonce"
  // (the guide's intended heading for this card — no such title exists in
  // the code today, so this names rather than renames). All form controls,
  // labels, estimate box, error, and submit behavior unchanged.
  return (
    <SectionCard title="Nouvelle annonce">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-neutral-900">Message</label>
          <textarea
            required
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-control focus:border-accent-600 mt-1 w-full border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-neutral-900">Canal</label>
          <div className="mt-2 flex gap-4">
            {CHANNELS.map((c) => (
              <label key={c.value} className="flex items-center gap-1.5 text-sm text-neutral-900">
                <input
                  type="checkbox"
                  checked={channels.includes(c.value)}
                  onChange={() => toggleChannel(c.value)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-neutral-900">Cible</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as TargetType)}
              className="rounded-control focus:border-accent-600 mt-1 w-full border border-neutral-300 px-3 py-2.5 text-sm outline-none"
            >
              {(Object.keys(TARGET_LABELS) as TargetType[]).map((t) => (
                <option key={t} value={t}>
                  {TARGET_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {needsTargetValue && (
            <FormField
              label={targetType === 'by_plan' ? 'Plan' : "Type d'activité"}
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          )}
        </div>

        <FormField
          label="Programmer pour (laisser vide pour publier immédiatement)"
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />

        <div className="rounded-control bg-neutral-25 border border-neutral-100 p-3 text-sm text-neutral-900">
          Destinataires estimés : <span className="font-semibold">{estimate ?? '…'}</span>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        <Button
          type="submit"
          loading={submitting}
          disabled={channels.length === 0 || !message.trim()}
        >
          {scheduledFor ? 'Programmer' : 'Publier'}
        </Button>
      </form>
    </SectionCard>
  );
}

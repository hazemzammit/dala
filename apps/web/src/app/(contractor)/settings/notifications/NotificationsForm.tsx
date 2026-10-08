'use client';

import { PageHero } from '@dala/ui-web';
import type { NotificationPrefsInput } from '@dala/validation';
import { BellIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { Switch } from '@/components/ui/Switch';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { updateNotificationPrefs } from './actions';

const DIGEST_OPTIONS: { value: NotificationPrefsInput['digest_frequency']; label: string }[] = [
  { value: 'off', label: 'Désactivé' },
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdomadaire' },
];

const CATEGORY_ROWS: {
  key: keyof Omit<NotificationPrefsInput, 'digest_frequency'>;
  label: string;
  description: string;
}[] = [
  {
    key: 'dispatch',
    label: 'Dispatch',
    description: 'Affectations et changements de dispatch du lendemain.',
  },
  {
    key: 'advances',
    label: 'Avances & paie',
    description: 'Demandes d\u2019avance en attente ou traitées.',
  },
  { key: 'materials', label: 'Matériaux', description: 'Demandes de matériaux en attente.' },
  { key: 'safety', label: 'Sécurité', description: 'Incidents et alertes de sécurité signalés.' },
];

/**
 * apps/web/src/app/(contractor)/settings/notifications/NotificationsForm.tsx
 *
 * Gap-closure guide §1.3 — email-digest framing confirmed with Hazem: these
 * four toggles control what's included in the email digest below, not a
 * push-notification category (web has no device-token registration). Same
 * `profiles.notification_prefs` shape as mobile — only the copy differs.
 */
export function NotificationsForm({ initialPrefs }: { initialPrefs: NotificationPrefsInput }) {
  const [prefs, setPrefs] = useState<NotificationPrefsInput>(initialPrefs);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  function save(next: NotificationPrefsInput) {
    setPrefs(next);
    setNotice(null);
    startTransition(async () => {
      const result = await updateNotificationPrefs(next);
      setNotice(result.success ? null : result.error);
    });
  }

  return (
    <>
      <PageHero
        icon={BellIcon}
        title="Notifications"
        description="Choisissez ce qui est inclus dans votre résumé par e-mail, et à quelle fréquence vous le recevez."
      />

      {notice && (
        <div className="border-danger/20 bg-danger/10 text-danger rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <SectionCard
        title="Catégories du résumé"
        description="Ces catégories déterminent ce qui apparaît dans votre e-mail de résumé."
      >
        <div className="flex flex-col divide-y divide-neutral-100">
          {CATEGORY_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">{row.label}</p>
                <p className="text-sm text-neutral-500">{row.description}</p>
              </div>
              <Switch
                checked={prefs[row.key]}
                onChange={(v) => save({ ...prefs, [row.key]: v })}
                disabled={isPending}
                label={row.label}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Fréquence du résumé"
        description="À quelle fréquence recevoir l'e-mail de résumé des éléments en attente."
      >
        <div className="flex gap-2">
          {DIGEST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => save({ ...prefs, digest_frequency: opt.value })}
              disabled={isPending}
              className={`rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
                prefs.digest_frequency === opt.value
                  ? 'bg-accent-600 border-accent-600 text-white'
                  : 'border-neutral-300 text-neutral-900 hover:border-neutral-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

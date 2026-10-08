'use client';

import { Button } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import type { SubmitFeedbackInput } from '@dala/validation';
import { ChatCircleIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';

import { submitFeedback } from './actions';


const CATEGORIES: { value: SubmitFeedbackInput['category']; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Autre' },
];

/**
 * apps/web/src/app/(contractor)/feedback/FeedbackForm.tsx
 *
 * Gap-closure guide §1.6 — same "no confirmation list of past
 * submissions" scope mobile keeps: a success notice + clearing the form
 * is the whole interaction, matching the plan's own low-priority framing
 * for this screen.
 */
export function FeedbackForm() {
  const router = useRouter();
  const [category, setCategory] = useState<SubmitFeedbackInput['category']>('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    if (!message.trim()) {
      setError('Décrivez le problème ou la suggestion.');
      return;
    }
    setSubmitting(true);
    const result = await submitFeedback({ category, message });
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setMessage('');
    setSuccess(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        icon={ChatCircleIcon}
        title="Signaler un problème"
        description="Un bug, une suggestion, ou une question sur l'application — votre message nous parvient directement."
      />

      <SectionCard title="Votre message">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-neutral-900">Catégorie</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
                    category === c.value
                      ? 'bg-accent-600 border-accent-600 text-white'
                      : 'border-neutral-300 text-neutral-900 hover:border-neutral-400'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-neutral-900">Message</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Décrivez ce que vous avez rencontré…"
              className="focus:border-accent-500 w-full rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}
          {success && (
            <p className="text-success text-sm">Merci ! Votre message a bien été transmis.</p>
          )}

          <div className="flex gap-3">
            <Button fullWidth={false} onClick={() => void handleSubmit()} loading={submitting}>
              <ChatCircleIcon size={16} className="me-1.5 inline" />
              Envoyer
            </Button>
            <Button variant="secondary" fullWidth={false} onClick={() => router.back()}>
              Retour
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

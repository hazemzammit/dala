'use client';

import { Button, FormField } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { deleteAccountConfirmSchema } from '@dala/validation';
import { WarningIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/app/(contractor)/settings/delete-account/DeleteAccountView.tsx
 *
 * Gap-closure guide §1.5. Every call here is a Supabase Auth SDK/RPC/
 * function-invoke call tied to the current browser session — same
 * reasoning as security-settings and the email-change flow, so this runs
 * entirely client-side, no server action wrapping it.
 */
export function DeleteAccountView() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setError(null);
    const parsed = deleteAccountConfirmSchema.safeParse({ confirmation });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confirmation requise.');
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const { error: requestError } = await supabase.rpc('request_account_deletion');
    if (requestError) {
      setBusy(false);
      setError(requestError.message);
      return;
    }

    const { data, error: fnError } = await supabase.functions.invoke('delete-account');
    setBusy(false);

    if (fnError || (data as { error?: string } | null)?.error) {
      setError(
        (data as { error?: string } | null)?.error ??
          'Impossible de supprimer le compte. Réessayez.',
      );
      return;
    }

    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <>
      <PageHero
        eyebrow="Mon compte"
        title="Supprimer mon compte"
        description="Cette action est immédiate et irréversible."
      />

      <SectionCard title="Attention">
        <div className="border-danger/20 bg-danger/10 flex items-start gap-3 rounded-2xl border p-4">
          <WarningIcon size={20} className="text-danger mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-neutral-900">Cette action est irréversible</p>
            <p className="mt-1 text-sm text-neutral-500">
              Votre compte et votre accès à toutes vos organisations seront supprimés
              définitivement. Si vous êtes seul propriétaire d&apos;une organisation, transférez-en
              la propriété avant de continuer.
            </p>
          </div>
        </div>

        <div className="mt-4 flex max-w-sm flex-col gap-4">
          <FormField
            label='Tapez "SUPPRIMER" pour confirmer'
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
          />
          {error && <p className="text-danger text-sm">{error}</p>}
          <Button
            variant="secondary"
            className="!border-danger !text-danger hover:!bg-danger/10"
            onClick={() => void handleDelete()}
            loading={busy}
          >
            Supprimer définitivement mon compte
          </Button>
        </div>
      </SectionCard>
    </>
  );
}

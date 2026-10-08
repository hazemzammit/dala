'use client';

import type { TrashItem } from '@dala/shared-types';
import { Button, EmptyState } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { BuildingsIcon, CarIcon, HardHatIcon, NoteIcon, TrashIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { restoreItem } from './actions';

const ENTITY_ICON: Record<TrashItem['entity_type'], typeof BuildingsIcon> = {
  project: BuildingsIcon,
  worker: HardHatIcon,
  vehicle: CarIcon,
  site_log: NoteIcon,
};

/** Mirrors mobile's daysRemaining() in trash.tsx — 30-day window from
 *  deleted_at, computed client-side, not stored anywhere. */
function daysRemaining(deletedAt: string): number {
  const deletedMs = new Date(deletedAt).getTime();
  const elapsedDays = (Date.now() - deletedMs) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(30 - elapsedDays));
}

export function TrashView({ items: initialItems }: { items: TrashItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleRestore(item: TrashItem) {
    setError(null);
    setPendingId(item.id);
    startTransition(async () => {
      const result = await restoreItem(item.entity_type, item.id);
      setPendingId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setItems((current) => current.filter((row) => row.id !== item.id));
      setNotice(`${item.label} restauré.`);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        icon={TrashIcon}
        title="Corbeille"
        description="Restaurable pendant 30 jours après suppression. Chantiers, travailleurs, véhicules et entrées de journal supprimés apparaissent ici."
      />

      {notice && (
        <div className="border-success/20 bg-success/10 text-success rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}
      {error && (
        <div className="border-danger/20 bg-danger/10 text-danger rounded-2xl border px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <SectionCard
        title="Éléments supprimés"
        description="Restaurez un élément avant l'expiration de son délai de 30 jours."
      >
        {items.length === 0 ? (
          <EmptyState
            icon={TrashIcon}
            title="La corbeille est vide"
            description="Les chantiers, travailleurs, véhicules et entrées de journal supprimés apparaissent ici pendant 30 jours avant suppression définitive."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const remaining = daysRemaining(item.deleted_at);
              const ItemIcon = ENTITY_ICON[item.entity_type];
              return (
                <div
                  key={`${item.entity_type}-${item.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-100 px-4 py-3"
                >
                  <div className="flex flex-1 items-center gap-3">
                    <ItemIcon size={20} className="text-neutral-500" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-semibold text-neutral-900">{item.label}</p>
                      <p className="text-xs text-neutral-500">
                        {remaining > 0
                          ? `Supprimé définitivement dans ${remaining} jour${remaining > 1 ? 's' : ''}`
                          : 'Suppression définitive imminente'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    disabled={isPending && pendingId === item.id}
                    onClick={() => handleRestore(item)}
                  >
                    Restaurer
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

import { LockKeyIcon } from '@phosphor-icons/react/ssr';

/**
 * Shown instead of a money screen (advances, analytics, reports) to viewers.
 * Server-component safe. See lib/orgRole.ts and migration 0103.
 */
export function MoneyRestricted({ title }: { title: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-3 px-6 py-24 text-center">
      <LockKeyIcon size={40} weight="duotone" className="text-neutral-400" />
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="text-sm text-neutral-600">
        Les informations financières (paie, avances, dépenses, facturation) sont réservées aux
        propriétaires et aux gestionnaires de l’organisation. Votre rôle d’observateur donne accès
        aux opérations uniquement.
      </p>
    </div>
  );
}

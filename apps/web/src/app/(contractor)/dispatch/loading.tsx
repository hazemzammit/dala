import { IconStatCardSkeleton } from '@dala/ui-web';

/**
 * Covers first load into /dispatch. Week-to-week navigation inside the
 * page (Aujourd'hui / semaine précédente / suivante) is handled by its
 * own pending overlay in DispatchView instead — that one dims the
 * existing grid rather than replacing it with this skeleton, since the
 * vehicles/layout don't change between weeks, only the assignments do.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-72 rounded bg-neutral-100 motion-safe:animate-pulse" />
        <div className="h-4 w-[28rem] max-w-full rounded bg-neutral-100 motion-safe:animate-pulse" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <IconStatCardSkeleton key={i} />
        ))}
      </div>

      <div className="rounded-card h-[560px] w-full bg-neutral-100 motion-safe:animate-pulse" />
    </div>
  );
}

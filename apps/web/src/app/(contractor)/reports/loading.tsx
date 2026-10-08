import { IconStatCardSkeleton } from '@dala/ui-web';

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 rounded bg-neutral-100 motion-safe:animate-pulse" />
        <div className="h-4 w-[32rem] max-w-full rounded bg-neutral-100 motion-safe:animate-pulse" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <IconStatCardSkeleton key={i} />
        ))}
      </div>

      <div className="rounded-card h-[260px] w-full bg-neutral-100 motion-safe:animate-pulse" />
      <div className="rounded-card h-[200px] w-full bg-neutral-100 motion-safe:animate-pulse" />
    </div>
  );
}

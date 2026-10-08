import { IconStatCardSkeleton } from '@dala/ui-web';

/**
 * Next.js App Router convention: automatically wraps `page.tsx` in this
 * route segment in a Suspense boundary and renders this while the server
 * component's data fetch is in flight — including on every subsequent
 * navigation into this route, not just first load. Before this file
 * existed, switching into Projects (or any of these three routes) showed
 * nothing at all until the fetch resolved.
 *
 * Shape mirrors ProjectsView's real layout (hero, 5-card stat row, table)
 * at a rough level so nothing visibly jumps when the real content swaps
 * in — exact copy isn't the goal, just the same rhythm of blocks.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-56 rounded bg-neutral-100 motion-safe:animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded bg-neutral-100 motion-safe:animate-pulse" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <IconStatCardSkeleton key={i} />
        ))}
      </div>

      <div className="rounded-card h-[420px] w-full bg-neutral-100 motion-safe:animate-pulse" />
    </div>
  );
}

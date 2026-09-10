'use client';

import type { Icon } from '@phosphor-icons/react';
import Link from 'next/link';

import { Button } from './Button';

/**
 * packages/ui-web/src/EmptyState.tsx
 *
 * Extracted from apps/web/src/components/ui/EmptyState.tsx and
 * apps/admin/src/components/ui/EmptyState.tsx (Phase 19B, item 3).
 *
 * BEHAVIORAL DIFFERENCE FOUND (flagged, not silently resolved): Web
 * supports two ways to wire the CTA — `actionHref` (renders a `Link`)
 * and `onAction` (onClick). Admin's version only had `onAction` — its
 * own comment explained why: "every admin screen that uses this is
 * already a Client Component, so onAction alone is enough." Resolution:
 * the union keeps both props; Admin's existing call sites keep passing
 * only `onAction`, exactly as before.
 *
 * BUILD FIX (found during verification, not part of the original two
 * apps' files): this component renders a Phosphor icon element
 * directly, and Phosphor's icon base uses React context internally
 * (confirmed by inspecting the built output — `createContext` inside
 * phosphor's bundled `IconBase`). Without an explicit `'use client'`
 * boundary here, `next build` failed real page-data collection for
 * `/dashboard` with `(0, m.createContext) is not a function` — code
 * using context got pulled into a server-executed chunk under the
 * "react-server" module condition, which doesn't ship the full client
 * React build. Neither original per-app file had this pragma either
 * (this bug was latent in both, just never hit a real `next build`
 * during this phase's development-server-only prior verification).
 * Adding `'use client'` here does NOT block the `actionHref` case from
 * being used by a Server Component page — Server Components can render
 * Client Components and pass serializable props (a string href) freely;
 * they just can't pass a fresh function prop across that boundary,
 * which is exactly why `onAction` alone was never enough for Web's
 * Server Component pages in the first place.
 */
interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="bg-accent-50 flex h-16 w-16 items-center justify-center rounded-full">
        <IconComponent size={28} className="text-accent-600" />
      </div>

      <h3 className="font-display mt-4 text-lg font-semibold text-neutral-900">{title}</h3>

      {description && <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{description}</p>}

      {actionLabel && actionHref && (
        <Link href={actionHref} className="mt-6">
          <Button>{actionLabel}</Button>
        </Link>
      )}

      {actionLabel && onAction && !actionHref && (
        <Button onClick={onAction} className="mt-6">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

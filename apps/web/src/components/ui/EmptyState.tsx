import type { Icon } from '@phosphor-icons/react';
import Link from 'next/link';

import { Button } from './Button';

/**
 * apps/web/src/components/ui/EmptyState.tsx
 *
 * Doc 05 §4 — "Illustration + headline + primary CTA. Every list screen
 * needs one (Doc 03 references several, e.g. 'Créez votre premier
 * chantier')." Doc 05 §5 checklist — "Does every list screen have a real
 * empty state, not a blank white rectangle?"
 *
 * No real illustration assets exist yet (Doc 05 §6 flags the Figma
 * reference links as inaccessible) — this uses a Phosphor icon in a
 * tinted accent circle as a placeholder illustration. Swap for real
 * illustration assets later without changing this component's API.
 *
 * Two ways to wire the CTA — pick based on where you're calling this from:
 *   - `actionHref`: renders a Link. Use this from a Server Component page
 *     (most list screens) — a function prop can't cross from a Server
 *     Component into this component's Button (a Client Component) without
 *     Next.js rejecting it, so a plain URL is what makes this usable from
 *     server-rendered pages at all.
 *   - `onAction`: renders an onClick handler. Only usable when EmptyState
 *     itself is rendered from inside an already-'use client' tree (e.g. a
 *     modal-opening action, not a navigation).
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

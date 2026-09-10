'use client';

import type { Icon } from '@phosphor-icons/react';
import { ArrowClockwiseIcon, LockIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from './Button';

/**
 * packages/ui-web/src/ErrorState.tsx
 *
 * Doc 05 §1.7a — "the single largest gap the audit found": used in only
 * 0/37 web screens and 0/20 admin screens before this. Built first in
 * Phase 19B, ahead of the other 8 extracted components, because it's a
 * genuinely new component (not an extraction) and item 3 below imports
 * from it (`DataTable`'s `emptyState` slot is the natural place a caller
 * composes `ErrorState` in). Deliberately built as `EmptyState`'s sibling
 * (same layout shell: icon circle → title → description → primary action
 * → optional secondary action), mirroring the relationship
 * `apps/mobile/src/components/ui/ErrorState.tsx` already has to mobile's
 * own `EmptyState` — a failed fetch and a genuinely empty dataset render
 * through parallel APIs, never identically.
 *
 * Anatomy (§1.7a, defined v5.2): icon/illustration → title →
 * human-readable explanation → primary retry action → optional secondary
 * action. Technical error details are never shown by default — there is
 * no prop for a raw error message on purpose.
 *
 * **Section-level vs. full-page** (§1.7a): this component doesn't force a
 * viewport-height container — it's centered padding only, the same way
 * `EmptyState` already works — so the SAME component correctly renders
 * either as a whole page's only content or nested inside one failing
 * section of a multi-source screen (e.g. a dashboard widget) without a
 * separate prop. That's the caller's composition choice, not something
 * this component needs to know about itself.
 *
 * **States to support** (§1.7a) — mapped to this component's API:
 * - *Initial failure* / *retry failure*: the same rendering — there's no
 *   different UI for a second failure, so no separate prop for it.
 * - *Retrying*: `retrying` — passed straight through to the retry
 *   `Button`'s own existing `loading` state (spinner replaces the label,
 *   width doesn't jump), rather than inventing a second loading mechanism.
 * - *Permission failure*: `variant="permission"` — a distinct message
 *   (§1.7b: never the generic error), and `onRetry` becomes optional,
 *   because retrying a permission-denied fetch doesn't help; only a
 *   §1.7q-style "next step" secondary action makes sense here, when the
 *   caller has one.
 * - *Offline failure*: deliberately NOT handled here. §1.7a says this
 *   defers to the offline banner rather than a duplicate message — but
 *   that banner (`OfflineBanner`) is mobile-only (confirmed: no such
 *   component exists anywhere in `apps/web` or `apps/admin`, and neither
 *   app has an offline-first architecture). There is nothing on web/admin
 *   for this state to defer to, so it isn't modeled here; inventing one
 *   would be adding a mobile concept neither app currently has.
 */
type ErrorStateVariant = 'default' | 'permission';

interface ErrorStateProps {
  icon?: Icon;
  title?: string;
  description?: string;
  variant?: ErrorStateVariant;
  retryLabel?: string;
  onRetry?: () => void;
  retrying?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const VARIANT_DEFAULTS: Record<
  ErrorStateVariant,
  { icon: Icon; title: string; description: string }
> = {
  default: {
    icon: WarningCircleIcon,
    title: 'Un problème est survenu',
    description: 'Impossible de charger ces données. Vérifiez votre connexion et réessayez.',
  },
  permission: {
    icon: LockIcon,
    title: "Vous n'avez pas la permission pour accéder à ces données",
    description: 'Contactez un responsable si vous pensez qu’il s’agit d’une erreur.',
  },
};

export function ErrorState({
  icon,
  title,
  description,
  variant = 'default',
  retryLabel = 'Réessayer',
  onRetry,
  retrying = false,
  secondaryLabel,
  onSecondary,
}: ErrorStateProps) {
  const defaults = VARIANT_DEFAULTS[variant];
  const IconComponent = icon ?? defaults.icon;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
        <IconComponent size={28} weight="fill" className="text-danger" />
      </div>

      <h3 className="font-display mt-4 text-lg font-semibold text-neutral-900">
        {title ?? defaults.title}
      </h3>

      <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
        {description ?? defaults.description}
      </p>

      {(onRetry || (secondaryLabel && onSecondary)) && (
        <div className="mt-6 flex items-center gap-3">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry} loading={retrying}>
              <span className="inline-flex items-center gap-1.5">
                <ArrowClockwiseIcon size={16} />
                {retryLabel}
              </span>
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button variant="text" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

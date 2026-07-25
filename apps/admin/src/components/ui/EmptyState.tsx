'use client';

import type { Icon } from '@phosphor-icons/react';

import { Button } from './Button';

/**
 * apps/admin/src/components/ui/EmptyState.tsx — mirrors apps/web's, minus
 * the actionHref/Server-Component split web needs (every admin screen that
 * uses this is already a Client Component, so onAction alone is enough).
 */
interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="bg-accent-50 flex h-16 w-16 items-center justify-center rounded-full">
        <IconComponent size={28} className="text-accent-600" />
      </div>
      <h3 className="font-display mt-4 text-lg font-semibold text-neutral-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

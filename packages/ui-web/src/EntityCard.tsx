import type { ReactNode } from 'react';

import { Card } from './Card';

/**
 * packages/ui-web/src/EntityCard.tsx
 *
 * Admin UI/UX overhaul pass — "card view" row renderer for Organizations
 * and Users list screens (§2.7 of the plan). Replaces a DataTable row
 * when the admin switches to card view via ViewToggle.
 *
 * Intentionally data-agnostic: callers pass the already-rendered ReactNode
 * content into named slots (title, subtitle, badges, fields, actions).
 * No opinion about what data is shown.
 *
 * When `href` is set the whole card is wrapped in an <a> for navigation;
 * actions slot is still clickable (stopPropagation is the caller's
 * responsibility if needed).
 */

interface EntityCardField {
  label: string;
  value: ReactNode;
}

interface EntityCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  fields?: EntityCardField[];
  actions?: ReactNode;
  href?: string;
}

export function EntityCard({ title, subtitle, badges, fields, actions, href }: EntityCardProps) {
  const inner = (
    <Card interactive={!!href} className="p-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-900">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-xs text-neutral-500">{subtitle}</div>}
        </div>
        {badges && <div className="flex shrink-0 flex-wrap gap-1.5">{badges}</div>}
      </div>

      {/* Fields grid */}
      {fields && fields.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-neutral-100 pt-3">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-[11px] font-semibold tracking-[0.04em] text-neutral-400">
                {f.label}
              </dt>
              <dd className="mt-0.5 text-xs text-neutral-900">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Actions row */}
      {actions && (
        <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
          {actions}
        </div>
      )}
    </Card>
  );

  if (href) {
    return (
      <a href={href} className="block no-underline">
        {inner}
      </a>
    );
  }

  return inner;
}

'use client';

import { ArrowLeftIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

/**
 * packages/ui-web/src/DetailHeader.tsx
 *
 * Admin UI/UX overhaul pass — header for Organization and User detail
 * pages (§2.11 of the plan).
 *
 * Anatomy (top → bottom):
 *   [optional breadcrumb strip]  "Organisations / Climatisation Cap Bon"
 *   [back arrow]  [56px logo/avatar circle]  [title]  [status]
 *   [meta row]   label: value  ·  label: value  …
 *   [actions row]
 *
 * Breadcrumb (§2.11 "Addition"):
 *   When `backLabel` is passed, renders "{backLabel} / {title}" above the
 *   main row. The first segment is a plain <a> to `backHref`. This is the
 *   same information the back arrow already conveys, written out — additive
 *   text row, not a router-level breadcrumb component.
 *
 * Avatar logic:
 *   - If `avatarUrl` is set → <img> with the signed URL.
 *   - Otherwise → initials circle using the same palette-hash as Avatar.tsx,
 *     or the fallback `icon` if no initials can be derived.
 */

const PALETTE = [
  'bg-accent-100 text-accent-700',
  'bg-warning/15 text-warning',
  'bg-success/15 text-success',
  'bg-neutral-200 text-neutral-900',
];

function paletteFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

interface MetaField {
  label: string;
  value: ReactNode;
}

interface DetailHeaderProps {
  backHref: string;
  backLabel?: string;
  icon: Icon;
  avatarUrl?: string | null;
  title: string;
  status?: ReactNode;
  meta?: MetaField[];
  actions?: ReactNode;
}

export function DetailHeader({
  backHref,
  backLabel,
  icon: IconComponent,
  avatarUrl,
  title,
  status,
  meta,
  actions,
}: DetailHeaderProps) {
  const initials = initialsOf(title);
  const palette = paletteFor(title);

  return (
    <div className="bg-neutral-0 rounded-card border border-neutral-100 p-6 shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]">
      {/* Breadcrumb strip */}
      {backLabel && (
        <nav aria-label="Fil d'Ariane" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs text-neutral-500">
            <li>
              <a href={backHref} className="text-accent-700 hover:underline">
                {backLabel}
              </a>
            </li>
            <li aria-hidden="true" className="select-none">
              /
            </li>
            <li className="truncate font-medium text-neutral-900">{title}</li>
          </ol>
        </nav>
      )}

      {/* Main header row */}
      <div className="flex flex-wrap items-start gap-4">
        {/* Back arrow */}
        <a
          href={backHref}
          aria-label={backLabel ? `Retour à ${backLabel}` : 'Retour'}
          title={backLabel ? `Retour à ${backLabel}` : 'Retour'}
          className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          <ArrowLeftIcon size={16} aria-hidden="true" />
          <span className="sr-only">{backLabel ? `Retour à ${backLabel}` : 'Retour'}</span>
        </a>

        {/* Avatar / logo circle */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={title}
            className="h-14 w-14 shrink-0 rounded-full border-2 border-neutral-100 object-cover"
          />
        ) : (
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-neutral-100 text-lg font-semibold ${palette}`}
            title={title}
          >
            {initials || <IconComponent size={24} weight="duotone" aria-hidden="true" />}
          </div>
        )}

        {/* Title + status */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[22px] font-semibold leading-tight text-neutral-900">
              {title}
            </h1>
            {status && <div className="flex flex-wrap items-center gap-1.5">{status}</div>}
          </div>

          {/* Meta fields */}
          {meta && meta.length > 0 && (
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {meta.map((f) => (
                <div key={f.label} className="flex items-center gap-1.5">
                  <dt className="text-[11px] font-semibold tracking-[0.04em] text-neutral-400">
                    {f.label}
                  </dt>
                  <dd className="text-xs text-neutral-700">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Actions */}
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

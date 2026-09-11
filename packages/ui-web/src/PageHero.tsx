import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

/**
 * packages/ui-web/src/PageHero.tsx
 *
 * Doc 05 §1.7h — "web's existing, highly consistent header formula
 * (eyebrow → title → description → actions, confirmed across 8 of 9
 * photographed web screens — the single most consistent pattern found
 * anywhere in the Phase 17 audit) is formalized as PageHero."
 *
 * This is a near-exact extraction of the informal precursor that already
 * existed as `PageHeader` in apps/web/src/components/contractor/Screen.tsx
 * — that implementation already matched §1.7h's anatomy almost exactly.
 * The only real change: `description` is now optional (§1.7h says
 * "optional, ~2 lines max"; the original had it as a required string).
 *
 * Now used by both apps — Admin adopted this in its UI overhaul pass
 * (Admin UI/UX overhaul plan §2.4). The `icon` prop is Admin's main
 * addition; apps/web call sites simply don't pass it and render
 * byte-identically to before. The stale "web-only / Admin's plain <h1>
 * is deliberate" comment has been removed — it no longer reflects reality.
 *
 * Responsive collapse (§1.7h: "actions moving below the description on
 * narrow viewports") — already correct in the original: `flex-col` below
 * `lg`, `lg:flex-row` above it.
 *
 * "Actions: 0–2, primary + optional secondary" (§1.7h) — kept as
 * `ReactNode` here, matching the original's flexible prop, rather than a
 * strict 2-item type. At least one existing screen (Dispatch) already
 * uses 5 action buttons in this slot; enforcing a 2-item cap here would
 * mean deleting working buttons from an existing screen mid-extraction,
 * which is a real behavior change, not a formalization. Flagged rather
 * than silently pruned.
 *
 * `icon` — optional Phosphor icon component. When passed, renders a 40px
 * rounded icon chip to the left of the title. The chip has aria-hidden so
 * it is never counted as part of the heading's accessible name (test
 * contract §0.4 requires the icon to be a sibling, not inside the <h1>).
 */
interface PageHeroProps {
  eyebrow?: string;
  icon?: Icon;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHero({
  eyebrow,
  icon: IconComponent,
  title,
  description,
  actions,
}: PageHeroProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[24px] border border-neutral-100 bg-[linear-gradient(180deg,rgba(15,118,110,0.05),rgba(255,255,255,0.92))] p-6 shadow-[0_8px_24px_rgba(17,19,24,0.04)] lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-accent-700 text-[12px] font-semibold uppercase tracking-[0.12em]">
            {eyebrow}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          {IconComponent && (
            <span
              aria-hidden="true"
              className="bg-accent-50 text-accent-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            >
              <IconComponent size={22} weight="duotone" />
            </span>
          )}
          <h1 className="font-display text-[28px] font-semibold leading-[1.1] text-neutral-900 lg:text-[34px]">
            {title}
          </h1>
        </div>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 lg:text-[15.5px]">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

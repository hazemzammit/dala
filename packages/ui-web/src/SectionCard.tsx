import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { Card } from './Card';

/**
 * packages/ui-web/src/SectionCard.tsx
 *
 * Admin UI/UX overhaul pass — tiny wrapper: Card + an icon+title header
 * row, used for every "Profil de l'entreprise" / "Membres" / "Notes
 * internes"-style sub-section so they get the same icon+heading treatment
 * as top-level pages. §2.12 of the plan.
 *
 * `tone` is forwarded to Card so a "Zone dangereuse" warning block can
 * have a red left-border accent without any extra wrapper.
 *
 * Phase 4.6 (premium-ux-system-guide.md §2 — hierarchy): tone-less
 * SectionCards render as Level-1 surfaces — Card's exact border/background/
 * radius but no shadow (a sub-section container is not the hero surface of
 * its screen; the DataTable card / PageHero / DetailHeader keep Level 2).
 * When a `tone` IS passed the rendering path is unchanged: full Card,
 * resting shadow + colored left border (a "Zone dangereuse" block SHOULD
 * stand out). The Level-1 case renders as its own div rather than through
 * Card, so Card's public API and every existing Card call site stay
 * byte-identical. (apps/web is unaffected either way — it uses its own
 * local SectionCard in components/contractor/Screen.tsx.)
 */

type SectionCardTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

interface SectionCardProps {
  icon?: Icon;
  title: string;
  tone?: SectionCardTone;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  icon: IconComponent,
  title,
  tone,
  children,
  className = '',
}: SectionCardProps) {
  const body = (
    <>
      {/* Section header */}
      <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3.5">
        {IconComponent && (
          <span
            aria-hidden="true"
            className="bg-accent-50 text-accent-600 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          >
            <IconComponent size={15} weight="duotone" />
          </span>
        )}
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      </div>

      {/* Content */}
      <div className="p-5">{children}</div>
    </>
  );

  return tone ? (
    <Card tone={tone} className={`overflow-hidden ${className}`}>
      {body}
    </Card>
  ) : (
    <div
      className={`rounded-card bg-neutral-0 overflow-hidden border border-neutral-100 ${className}`}
    >
      {body}
    </div>
  );
}

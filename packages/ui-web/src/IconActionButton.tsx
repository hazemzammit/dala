'use client';

import type { Icon } from '@phosphor-icons/react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

/**
 * packages/ui-web/src/IconActionButton.tsx
 *
 * Admin UI/UX overhaul pass — small rounded-square icon-only action
 * control that replaces bare text action links/buttons (§2.8 of the plan).
 *
 * Test-contract guarantee (§0.4): the `label` prop becomes both
 * `aria-label` and a `title` tooltip, AND is repeated in a `sr-only` span
 * for belt-and-suspenders accessible name matching. `getByRole('button',
 * { name: 'Suspendre' })` resolves correctly whether the element is a
 * <button> or an <a> rendered as a button, and whether the name comes
 * from aria-label or visible text.
 *
 * `href` — when set, renders an <a> element instead of <button>.
 *          Same visual treatment; use for links that were plain <a> before.
 *
 * Premium-polish pass (pre-Phase-5 cleanup): previously this had NO
 * resting-state chrome at all — no border, no background, color only on
 * hover — so a row of these read as plain icons, not buttons, until you
 * moused over them. Now every control gets a real bg-neutral-0 + border
 * + small shadow surface at rest (via elevation.control), and hover
 * shifts border/background into the tone color instead of introducing
 * one for the first time. Sizes bumped 32px/28px → 36px/32px.
 *
 * Phase 4.6 (premium-ux-system-guide.md §8 — motion): hover lift
 * (`hover:-translate-y-px`) removed — small controls get their hover
 * signal from the background/border/shadow shift alone; lift is reserved
 * for primary CTAs, interactive Cards, and floating pill controls. The
 * matching `disabled:hover:translate-y-0` reset went with it. Hover
 * shadow deepening (`elevation.control.hoverShadow`) is unchanged.
 *
 * Phase 4.6 (premium-ux-system-guide.md §14 — icon sizes): md icon
 * bumped 17px → 18px ("18px buttons/nav"). sm stays 15 — that's the
 * inline/table tier, which §14 pins separately.
 */

type IconActionTone = 'accent' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<IconActionTone, string> = {
  accent: 'text-accent-700 hover:border-accent-200 hover:bg-accent-50',
  warning: 'text-warning hover:border-warning/30 hover:bg-warning/10',
  danger: 'text-danger hover:border-danger/30 hover:bg-danger/10',
  neutral: 'text-neutral-500 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900',
};

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

type IconSize = 'sm' | 'md';

interface BaseProps {
  icon: Icon;
  label: string;
  tone?: IconActionTone;
  size?: IconSize;
}

type ButtonMode = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { href?: undefined };

type AnchorMode = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & { href: string };

type IconActionButtonProps = ButtonMode | AnchorMode;

export function IconActionButton({
  icon: IconComponent,
  label,
  tone = 'neutral',
  size = 'md',
  href,
  className = '',
  ...rest
}: IconActionButtonProps) {
  const shared = {
    'aria-label': label,
    title: label,
    className: [
      'inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-0',
      'shadow-[0_1px_2px_rgba(17,19,24,0.05)] transition-all duration-150',
      'hover:shadow-[0_2px_6px_rgba(17,19,24,0.08)]',
      sizeClasses[size],
      toneClasses[tone],
      'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-[0_1px_2px_rgba(17,19,24,0.05)]',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  };

  const inner = (
    <>
      <IconComponent size={size === 'sm' ? 15 : 18} weight="bold" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );

  if (href !== undefined) {
    return (
      <a href={href} {...shared} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" {...shared} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  );
}

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
 */

type IconActionTone = 'accent' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<IconActionTone, string> = {
  accent: 'text-accent-700 hover:bg-accent-50',
  warning: 'text-warning hover:bg-warning/10',
  danger: 'text-danger hover:bg-danger/10',
  neutral: 'text-neutral-500 hover:bg-neutral-100',
};

const sizeClasses = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
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
      'inline-flex items-center justify-center rounded-lg transition-colors',
      sizeClasses[size],
      toneClasses[tone],
      'disabled:cursor-not-allowed disabled:opacity-60',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  };

  const inner = (
    <>
      <IconComponent size={size === 'sm' ? 14 : 16} weight="bold" aria-hidden="true" />
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

/**
 * apps/web/src/lib/theme.ts
 *
 * *** ALWAYS re-read this file's actual current contents before extending
 * it or writing code that depends on it. Do not assume its shape from
 * memory or from a previous session. ***
 *
 * This wraps @dala/design-tokens for web-specific consumption (CSS variables,
 * className helpers). Tamagui (mobile) consumes the same @dala/design-tokens
 * package directly in apps/mobile/src/lib/theme.ts — keep both wrappers thin;
 * all real values live in packages/design-tokens, never duplicated here.
 */

import { color, radius, spacing, typography, elevation, motion } from '@dala/design-tokens';

export const theme = {
  color,
  radius,
  spacing,
  typography,
  elevation,
  motion,
} as const;

export type Theme = typeof theme;

/**
 * CSS custom properties injected once at the root layout, so raw Tailwind
 * utility classes AND ad-hoc inline styles can both reference the same
 * source of truth without importing this module everywhere.
 */
export function themeToCssVariables(): Record<string, string> {
  return {
    '--color-accent-600': color.accent[600],
    '--color-neutral-25': color.neutral[25],
    '--color-neutral-900': color.neutral[900],
    '--radius-card': `${radius.card}px`,
    '--radius-control': `${radius.control}px`,
  };
}

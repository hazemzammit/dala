import { useTheme } from 'tamagui';

/**
 * apps/mobile/src/lib/useTokenColor.ts
 *
 * The dark-mode UI/UX pass (see tamagui.config.ts's own comment) made
 * every `$neutral0`/`$neutral900`/etc. Tamagui-styled prop theme-aware for
 * free, by defining a same-named `themes.dark` key for each. But ~16
 * component files also read color values directly from
 * `@dala/design-tokens`'s `color` object in plain JS — mostly for icon
 * `color=` props and SVG `fill`/`stroke` attributes, which need a literal
 * string rather than a Tamagui `$token` reference. Those bypass Tamagui's
 * theme resolution entirely and always render the light-mode hex value.
 *
 * This hook is the fix: `useTheme()` returns the ACTIVE theme's resolved
 * variables (reactively — a component using this hook re-renders when the
 * theme changes), and `.val` reads out the literal string each one
 * resolves to. Components call this once per render and get back a flat
 * object with the same key names as the token file, so a call site that
 * used to read `color.neutral[500]` now reads `tc.neutral500` instead —
 * same value in light mode, correctly dark in dark mode.
 *
 * Deliberately only exposes the keys that are both (a) defined per-theme
 * in tamagui.config.ts and (b) actually consumed as a raw JS color value
 * somewhere in the app — not a 1:1 mirror of the whole design-tokens
 * palette, which would invite hardcoding new theme-unaware usages of keys
 * (like the accent 200/300/400/800/900 ramp) that were never meant to be
 * read outside of Tamagui's own token resolution in the first place.
 */
export function useTokenColor() {
  const theme = useTheme();
  return {
    neutral0: theme.neutral0.val as string,
    neutral25: theme.neutral25.val as string,
    neutral100: theme.neutral100.val as string,
    neutral200: theme.neutral200.val as string,
    neutral300: theme.neutral300.val as string,
    neutral500: theme.neutral500.val as string,
    neutral900: theme.neutral900.val as string,
    accent50: theme.accent50.val as string,
    accent100: theme.accent100.val as string,
    accent600: theme.accent600.val as string,
    accent700: theme.accent700.val as string,
    success: theme.success.val as string,
    warning: theme.warning.val as string,
    danger: theme.danger.val as string,
  };
}

export type TokenColors = ReturnType<typeof useTokenColor>;

/**
 * Tamagui doesn't support Tailwind's "/10" alpha-suffix syntax on token
 * strings, so a tinted (non-solid) surface — a status badge background, a
 * toast background, a delta chip background — has always needed a
 * precomputed rgba() string (this exact helper already existed,
 * duplicated, inside `StatusBadge.tsx`). Extracted here so every tinted
 * surface can share one implementation AND, more importantly, so they can
 * all be computed from `useTokenColor()`'s theme-resolved base color
 * instead of either a raw `color.status.danger` (light-only) or a
 * hand-picked pastel hex literal (`'#EAF7EF'`, `'#FBEAE9'` — StatCard.tsx
 * and Toast.tsx both had these, matching no token at all, light-only by
 * construction since they were never derived from anything theme-aware).
 */
export function toRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

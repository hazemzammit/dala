/**
 * @dala/design-tokens
 *
 * Ref: docs/spec/05-design-system-and-ux-spec.md §1
 *
 * This is the ONE place brand values live. `apps/mobile`'s Tamagui config
 * and `apps/web`'s Tailwind config both import from here rather than
 * hardcoding hex values — that's the concrete mechanism that keeps mobile
 * and web feeling like the same product (Doc 00 §0.6).
 *
 * Do not hardcode a color/spacing/radius value directly in a component.
 * If a value you need isn't here, add it here first, then consume it.
 */

export const color = {
  accent: {
    50: '#F0FBFA',
    100: '#D7F3F0',
    200: '#AEE7E0',
    300: '#7DD6CB',
    400: '#4CBFB0',
    500: '#2AA99A',
    600: '#0F9D8E', // primary brand teal — buttons, active nav, links, focus rings
    700: '#0C7A6F',
    800: '#0A5D55',
    900: '#0B4F4A',
  },
  neutral: {
    0: '#FFFFFF', // cards, sheets, modals — the "raised" surface
    25: '#FAFAFA', // app/page background — never pure white behind cards
    100: '#F2F2F3',
    200: '#E6E7E9',
    300: '#DADDE1',
    500: '#6B7280', // secondary/muted text, placeholders
    900: '#111318', // primary text — never pure #000
  },
  status: {
    success: '#1F9254', // muted green — Payé, Approuvé, on-track deltas
    warning: '#C08A1E', // muted amber — En attente, storage 80% banner
    danger: '#C0433D', // muted brick red — Refusé, overdue, destructive actions
    // info deliberately reuses accent-500 — never introduce a second cool color
  },
  dark: {
    // Dark mode is a nice-to-have (not required for MVP) but the token
    // layer exists from day one so enabling it is (mostly) a config swap.
    // UI/UX pass: this block was previously only 3 values (neutral25,
    // neutral0, accentPrimary) — not enough to actually theme the app,
    // since every screen references specific tokens for text
    // (neutral900/neutral500), borders/dividers (neutral100/200/300), and
    // accent tints (accent50/100) that had no dark equivalent at all.
    // Filled out to a complete mirror of every light-mode color key
    // actually referenced anywhere in `apps/mobile/src` (verified via
    // `grep -rhoE '\$[a-zA-Z]+[0-9]*'` across every screen/component —
    // see apps/mobile/src/lib/tamagui.config.ts's own comment for how
    // these get wired into an actual swappable Tamagui theme).
    //
    // Status colors: WCAG AA-audited against both dark backgrounds below
    // (contrast-ratio math run directly — see delivery notes), not just
    // eyeballed. `warning` passed unchanged (6.29:1 / 5.78:1 against
    // neutral25-dark / neutral0-dark, both well over the 4.5:1 normal-text
    // threshold). `success` and `danger` FAILED at their light-mode hex
    // values for normal-size text — success measured 4.83:1/4.44:1 (fails
    // the card-background case by a hair) and danger measured
    // 3.75:1/3.45:1 (fails both outright) — so both got lightened here
    // specifically to clear 4.5:1 against the darker of the two
    // backgrounds (neutral0-dark, the more common case since most status
    // text sits on a card, not bare page background), same hue family,
    // verified at 6.26:1/5.75:1 and 5.75:1/5.28:1 respectively.
    neutral25: '#0E0F12', // app/page background
    neutral0: '#17191D', // cards, sheets, modals — the "raised" surface
    neutral100: '#22252B', // subtle fills — skeleton shimmer, quick-action icon circles
    neutral200: '#2A2D33', // dividers, dot indicators
    neutral300: '#34373E', // input/card borders
    neutral500: '#9CA3AF', // secondary/muted text — lighter than light-mode's #6B7280 for contrast on near-black
    neutral900: '#F2F3F5', // primary text — was near-black for light backgrounds; inverted to near-white
    accent50: '#123C38', // darkened accent tint — badge/icon-circle backgrounds
    accent100: '#1A4B45',
    accent600: '#2AA99A', // one step lighter than light-mode 600 for contrast on near-black
    accent700: '#4CBFB0',
    success: '#26A862', // WCAG AA-audited lighten of light-mode #1F9254 — see comment above
    warning: '#C08A1E', // unchanged — already passes AA at both dark backgrounds
    danger: '#DE6961', // WCAG AA-audited lighten of light-mode #C0433D — see comment above
  },
} as const;

export const typography = {
  fontFamily: {
    display: 'Sora', // app name, screen titles, "numbers that matter" — ONLY
    body: 'System', // SF Pro / Roboto on mobile, Inter on web (native rendering)
  },
  scale: {
    heroNumber: { size: 36, weight: 600, lineHeight: 1.15, family: 'display' },
    screenTitle: { size: 23, weight: 600, lineHeight: 1.2, family: 'display' },
    wordmark: { weight: 700, family: 'display' },
    sectionLabel: {
      size: 13,
      weight: 600,
      lineHeight: 1.3,
      family: 'body',
      uppercase: true,
      letterSpacing: 0.04,
    },
    body: { size: 15.5, weight: 400, lineHeight: 1.4, family: 'body' },
    caption: { size: 12.5, weight: 400, lineHeight: 1.4, family: 'body' },
  },
  /** Anywhere numbers stack in a column (salary tables, cost columns). */
  numericVariant: 'tabular-nums',
} as const;

export const spacing = {
  unit: 4,
  scale: [8, 12, 16, 24, 32] as const,
};

export const radius = {
  control: 12, // buttons, inputs, chips
  card: 16,
  sheet: 22, // modals / bottom sheets / large hero cards (20–24px range)
};

export const elevation = {
  // Two layers only, deliberately — never three or four shadow depths.
  resting: {
    border: `1px solid ${color.neutral[100]}`,
    shadow: '0 1px 2px rgba(17,19,24,0.04), 0 4px 12px rgba(17,19,24,0.03)',
  },
  raised: {
    // modal / dropdown / actively-dragged dispatch chip
    shadow: '0 4px 10px rgba(17,19,24,0.08), 0 12px 24px rgba(17,19,24,0.06)',
  },
};

export const motion = {
  screenTransitionMs: 220,
  microInteractionMs: 135,
  dragLiftScale: 1.03,
  dragRejectReturnMs: 200,
};

/**
 * RTL note (Doc 00 §0.6): Arabic ships as a locale and is RTL. Every screen
 * must use LOGICAL properties, not physical ones, from the first screen
 * built:
 *   - Tamagui (mobile): marginStart / marginEnd, not marginLeft / marginRight
 *   - Tailwind (web): ms-* / me-*, not ml-* / mr-*
 *   - React Native: I18nManager.forceRTL() wired up (even if unused) early
 * This is a day-one convention, not a Phase-6 retrofit — retrofitting logical
 * properties across ~40 already-built screens is far more expensive than
 * writing them that way from the start.
 */
export const RTL_CONVENTION_NOTE =
  'Use logical properties (marginStart/End, ms-/me-) everywhere. Never marginLeft/Right or ml-/mr-.';

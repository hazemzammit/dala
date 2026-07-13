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
    // Dark mode is a nice-to-have (not required for MVP) but the token layer
    // exists from day one so enabling it is a config swap, not a rewrite.
    neutral25: '#0E0F12',
    neutral0: '#17191D',
    accentPrimary: '#2AA99A', // one step lighter than light-mode 600 for contrast on near-black
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

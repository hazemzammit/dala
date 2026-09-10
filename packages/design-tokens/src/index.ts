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
    400: '#9298A1', // muted icon convention (Doc 05 §1.7k migration) — replaces the untokenized #8A8F98 found 10x in project/[id].tsx (Phase 17 audit logged 12; recount during Phase 19A found 10 — noted, not re-audited)
    500: '#6B7280', // secondary/muted text, placeholders
    900: '#111318', // primary text — never pure #000
  },
  status: {
    success: '#1F9254', // muted green — Payé, Approuvé, on-track deltas
    warning: '#C08A1E', // muted amber — En attente, storage 80% banner
    danger: '#C0433D', // muted brick red — Refusé, overdue, destructive actions
    // info deliberately reuses accent-500 — never introduce a second cool color
    warningTint: '#FDF3DC', // tinted warning banner background (Doc 05 §1.7k migration) — replaces the untokenized #FEF3D8 found in dispatch.tsx:1230
  },
  /**
   * UI/UX pass (Chantiers/Avances audit) — non-status, categorical meaning
   * only: project-type icon-chip tints, worker-role differentiation. These
   * are NEVER used for buttons/CTAs or active/selected states — accent600
   * stays the app's one and only "action" color, per Doc 05. Using a
   * category color on a button would blur the "this is tappable and
   * primary" signal accent600 currently carries everywhere unambiguously.
   * Three hues, deliberately — not "more colors," a small closed set so
   * project_type can map to a repeatable, memorizable color family
   * (Doc 03 §3.10.3's PROJECT_TYPES has 6 values; each type gets an icon,
   * and the icon-chip background cycles through these 3 tints rather than
   * inventing 6 distinct hues, which would tip into "rainbow" territory).
   */
  categorical: {
    blue: '#3E6FD1',
    violet: '#7B5FCE',
    amber: '#B5790F',
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
    // Phase 19F / Doc 05 §1.7c — neutral400 (muted icon convention, added
    // 19A) had no dark equivalent. Contrast-checked (relative-luminance
    // math run directly, same method as the audit above) against both
    // dark backgrounds: unchanged light-mode hex #9298A1 measures 6.06:1
    // against neutral0-dark (#17191D) and 6.60:1 against neutral25-dark
    // (#0E0F12) — both clear the 4.5:1 AA normal-text threshold with
    // margin to spare, so (like `warning` below) this one passes
    // unchanged rather than needing a lighten.
    neutral400: '#9298A1', // muted icon convention — unchanged, see comment
    neutral500: '#9CA3AF', // secondary/muted text — lighter than light-mode's #6B7280 for contrast on near-black
    neutral900: '#F2F3F5', // primary text — was near-black for light backgrounds; inverted to near-white
    accent50: '#123C38', // darkened accent tint — badge/icon-circle backgrounds
    accent100: '#1A4B45',
    accent600: '#2AA99A', // one step lighter than light-mode 600 for contrast on near-black
    accent700: '#4CBFB0',
    success: '#26A862', // WCAG AA-audited lighten of light-mode #1F9254 — see comment above
    warning: '#C08A1E', // unchanged — already passes AA at both dark backgrounds
    danger: '#DE6961', // WCAG AA-audited lighten of light-mode #C0433D — see comment above
    // Phase 19F / Doc 05 §1.7c — warningTint (added 19A, tinted warning
    // banner background) had no dark equivalent. The light-mode value
    // (#FDF3DC, a near-white pastel) can't just carry over — it would
    // read as a bright, out-of-place card on a near-black page, the same
    // reason accent50/100 above were darkened rather than reused. Chosen
    // as a dark, desaturated amber tint in the same hue family as
    // `warning`, following accent50/100's "darken the tint, keep the hue"
    // pattern. Contrast-checked: dark-mode `warning` text (#C08A1E) on
    // this background (#2B2412) measures 5.06:1 (relative-luminance
    // math), clearing the 4.5:1 AA normal-text threshold — the case that
    // matters, since this tint's only real use is as a background behind
    // warning-colored text/icons in a banner.
    warningTint: '#2B2412',
    // Categorical set — lightened one step for the same near-black
    // contrast reason as success/danger above (icon-on-tinted-chip use,
    // not text-on-background, so this is a reasonable single-step lighten
    // rather than a formally re-audited value; revisit if these ever
    // carry body text directly).
    categoricalBlue: '#6E93E0',
    categoricalViolet: '#A18CE0',
    categoricalAmber: '#D19A2E',
  },
} as const;

/**
 * Financial-semantic tokens (Doc 05 §1.7j). Three ALIASES onto
 * `color.status` above — deliberately zero new hex values. Color is
 * "never sufficient on its own" for financial meaning (the actual fix
 * for e.g. `Bénéfice −680 TND` is the label-change rule in §1.7j, not a
 * new color); these exist only so a future palette change to
 * `color.status.danger` etc. can't silently desync "this is a
 * dangerous UI state" from "this figure is bad news" — referencing the
 * same values here means there is nothing to keep in sync by hand.
 */
export const financial = {
  positive: color.status.success,
  negative: color.status.danger,
  pending: color.status.warning,
} as const;

/**
 * Dark-mode twin of `financial` above (Phase 19F / Doc 05 §1.7c) —
 * financial-semantic tokens had no dark equivalent even though the
 * underlying `color.dark.success/danger/warning` values they'd need to
 * alias already existed from the original dark-palette pass. Same
 * zero-new-hex-values principle: these alias `color.dark` exactly.
 * No consumer currently imports `financial` in either app (checked before
 * writing this — it's declared but not yet wired into a screen), so this
 * is pure groundwork, not a behavior change to anything shipping today.
 */
export const financialDark = {
  positive: color.dark.success,
  negative: color.dark.danger,
  pending: color.dark.warning,
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

/**
 * Surface hierarchy (Doc 05 §1.7k) — a named, ORDERED vocabulary for
 * which of the app's existing surfaces a given piece of content should
 * sit on. This does not add a third elevation tier: every level below
 * composes only `color.neutral`/`elevation` values that already exist.
 *
 * JUDGMENT CALL (flagged per Phase 19A instructions): §1.7k describes
 * "Grouped" qualitatively only ("subtle tint, no shadow") without a
 * hex value. `neutral-100` is used here as that tint — it's already
 * the codebase's established "subtle fill" token (see its `color.ts`
 * comment: "subtle fills — skeleton shimmer, quick-action icon
 * circles"), and it sits strictly between Page (`neutral-25`) and
 * Card's `neutral-0` background, so a Grouped surface is visually
 * distinguishable from both its neighbors. No spec value existed to
 * pick from; this is an interpretation, not a spec-stated fact.
 *
 * Hero (mobile-only `CriticalMetricHero`) and Modal/Sheet are
 * deliberately given only a `note`, no background/border/shadow triple
 * — both are existing, separately-specified components (not being
 * touched in 19A) that this token layer shouldn't try to redefine.
 */
export const surfaceHierarchy = {
  page: {
    level: 1,
    background: color.neutral[25],
    border: 'none',
    shadow: 'none',
  },
  flat: {
    level: 2,
    background: 'transparent',
    border: 'none',
    shadow: 'none',
  },
  grouped: {
    level: 3,
    background: color.neutral[100], // subtle tint — see JUDGMENT CALL above
    border: 'none',
    shadow: 'none',
  },
  card: {
    level: 4,
    background: color.neutral[0],
    border: elevation.resting.border,
    shadow: elevation.resting.shadow,
  },
  hero: {
    level: 5,
    note: 'CriticalMetricHero — mobile only, existing component, not a background/border/shadow triple',
  },
  floating: {
    level: 6,
    background: color.accent[600],
    shadow: elevation.raised.shadow,
    note: 'FAB only — see §1.7l / fabLayout.ts',
  },
  modalSheet: {
    level: 7,
    shadow: elevation.raised.shadow,
    scrim: 'rgba(17,19,24,0.4)',
    note: 'unchanged from existing Sheet component',
  },
} as const;

/**
 * Dark-mode twin of `surfaceHierarchy` above (Phase 19F / Doc 05 §1.7c) —
 * the surface-hierarchy tokens (added 19A, after the original dark-palette
 * pass) had no dark equivalent at all. Only `background`/`border` values
 * that reference light-mode `color.neutral`/`elevation` are swapped for
 * their `color.dark` counterparts; `shadow`/`scrim`/`level`/`note` fields
 * are unchanged where they're already theme-agnostic (a shadow is always
 * some flavor of translucent black, a scrim dims regardless of theme).
 *
 * `card`'s border uses `color.dark.neutral300` rather than
 * `color.dark.neutral100` (which is what light mode's `neutral[100]`
 * maps to positionally) — `neutral300`'s own comment already names it
 * "input/card borders" for dark mode specifically, so that's the correct
 * token to reach for here, not a positional mirror of the light-mode
 * choice.
 *
 * `card`'s shadow is deliberately dropped to `'none'` rather than reusing
 * `elevation.resting.shadow` — that shadow is a translucent BLACK
 * (`rgba(17,19,24,...)`), which is invisible against `neutral0-dark`
 * (`#17191D`, itself near-black); dark UIs conventionally communicate
 * elevation via a lighter border/background step instead of a shadow for
 * exactly this reason. `floating`/`modalSheet` keep their shadows — those
 * sit above OTHER dark surfaces at a bigger visual jump (FAB above page
 * content, modal above a scrim), where the same contrast problem is far
 * less pronounced and redesigning them is outside this token-only pass.
 *
 * CriticalMetricHero (the `hero` level's note) was checked directly, not
 * assumed: no component by that name exists in the codebase today
 * (`apps/mobile/src/components` has no Hero/Metric-named file) — the
 * closest existing pieces are `StatCard.tsx`/`NumericText.tsx`. Since
 * `hero` carries no background/border/shadow values to make dark-aware
 * in the first place (light-mode `surfaceHierarchy.hero` is a note only),
 * there is nothing for this dark twin to add or confirm at the token
 * level; whether an actual black-background hero pattern needs
 * special-casing is a component-level question for whenever it's built,
 * not something this token file can resolve.
 */
export const surfaceHierarchyDark = {
  page: {
    level: 1,
    background: color.dark.neutral25,
    border: 'none',
    shadow: 'none',
  },
  flat: {
    level: 2,
    background: 'transparent',
    border: 'none',
    shadow: 'none',
  },
  grouped: {
    level: 3,
    background: color.dark.neutral100,
    border: 'none',
    shadow: 'none',
  },
  card: {
    level: 4,
    background: color.dark.neutral0,
    border: `1px solid ${color.dark.neutral300}`,
    shadow: 'none',
  },
  hero: {
    level: 5,
    note: 'CriticalMetricHero — no such component currently exists in the codebase; see comment above. Nothing to make dark-aware here at the token level.',
  },
  floating: {
    level: 6,
    background: color.dark.accent600,
    shadow: elevation.raised.shadow,
    note: 'FAB only — see §1.7l / fabLayout.ts',
  },
  modalSheet: {
    level: 7,
    shadow: elevation.raised.shadow,
    scrim: 'rgba(17,19,24,0.4)',
    note: 'unchanged from existing Sheet component',
  },
} as const;

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

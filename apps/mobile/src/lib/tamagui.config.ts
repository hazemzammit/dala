/**
 * apps/mobile/src/lib/tamagui.config.ts
 *
 * *** ALWAYS re-read this file's actual current contents before extending
 * it. Do not assume its shape from memory. *** (Same convention as
 * apps/web/src/lib/theme.ts — both wrap @dala/design-tokens, the single
 * source of truth for every color/spacing/radius value in the product.)
 */
import { color, motion, radius } from '@dala/design-tokens';
import { createAnimations } from '@tamagui/animations-react-native';
import { config as tamaguiDefaultConfig } from '@tamagui/config';
import { createFont, createTamagui } from 'tamagui';

/**
 * `@dala/design-tokens`' `motion.microInteractionMs` (135ms) is the single
 * source of truth for every button-press / label-crossfade spring in the
 * app — defined there for Doc 05 parity with web, but unused until now.
 * `press` and `crossfade` are two damping profiles at the same duration:
 * `press` has a touch of overshoot (springy scale-back), `crossfade` is
 * critically damped (no bounce — a label swapping under a fade shouldn't
 * wobble). `screenTransition` maps to `motion.screenTransitionMs` (220ms)
 * for anything that isn't a native stack transition (e.g. a custom
 * modal/sheet reveal).
 */
const animations = createAnimations({
  press: {
    type: 'spring',
    damping: 18,
    mass: 1,
    stiffness: 260,
    duration: motion.microInteractionMs * 10, // ~1350ms fallback cap; spring settles well before this
  },
  crossfade: {
    type: 'spring',
    damping: 26,
    mass: 1,
    stiffness: 300,
    duration: motion.microInteractionMs * 10,
  },
  screenTransition: {
    type: 'spring',
    damping: 22,
    mass: 1,
    stiffness: 180,
    duration: motion.screenTransitionMs * 10,
  },
});

/**
 * IMPROVEMENT-PLAN — `@dala/design-tokens`' `typography.fontFamily.display:
 * 'Sora'` (screen titles, hero numbers, the wordmark — ~90 call sites via
 * `fontFamily="$display"`) was never actually backed by a real Tamagui
 * font. `@tamagui/config`'s stock config only registers `heading`/`body`
 * (verified against its own source/docs — no third key) — `$display` was
 * an unresolved token, silently falling back to the OS system font on
 * every single one of those call sites, on every device that's ever run
 * this app. This is the other half of that fix (see _layout.tsx for the
 * useFonts() call that actually loads the .ttf bytes) — without this
 * `fonts.display` entry, loading the font file alone would NOT have fixed
 * anything, since $display still wouldn't resolve to it.
 *
 * `family` is the fallback face; `face` maps each `fontWeight` this app
 * actually passes alongside `$display` (600 everywhere except the
 * wordmark and two NumericText hero figures, which pass 700) to the exact
 * loaded font key from `useFonts()` in _layout.tsx — required on Android
 * per Tamagui's own docs ("you need to set the face option ... or else
 * fonts won't pick up different weights, due to a React Native
 * restriction"). `size`/`lineHeight`/`weight`/`letterSpacing` are copied
 * from the stock `body` font's scale rather than authored fresh: every
 * `$display` call site in this app passes its own explicit `fontSize`/
 * `fontWeight` props rather than using Tamagui's `$1..$16` size tokens, so
 * these scales are only needed to satisfy `createFont`'s required shape —
 * inheriting `body`'s is a safe default, not a real design decision.
 */
const displayFont = createFont({
  ...tamaguiDefaultConfig.fonts.body,
  family: 'Sora_600SemiBold',
  face: {
    600: { normal: 'Sora_600SemiBold' },
    700: { normal: 'Sora_700Bold' },
  },
});

const dalaConfig = createTamagui({
  ...tamaguiDefaultConfig,
  animations,
  fonts: {
    ...tamaguiDefaultConfig.fonts,
    display: displayFont,
  },
  tokens: {
    ...tamaguiDefaultConfig.tokens,
    color: {
      ...tamaguiDefaultConfig.tokens.color,
      // These flat tokens are the LIGHT-mode values, kept as the
      // fallback Tamagui uses if a theme doesn't define a same-named
      // key. See the `themes` block below for the actual dark-mode
      // swap — every key here has a matching key there.
      accent600: color.accent[600],
      accent700: color.accent[700],
      accent50: color.accent[50],
      accent100: color.accent[100],
      neutral25: color.neutral[25],
      neutral100: color.neutral[100],
      neutral200: color.neutral[200],
      neutral300: color.neutral[300],
      neutral400: color.neutral[400],
      neutral500: color.neutral[500],
      neutral0: color.neutral[0],
      neutral900: color.neutral[900],
      success: color.status.success,
      warning: color.status.warning,
      danger: color.status.danger,
      warningTint: color.status.warningTint,
      categoricalBlue: color.categorical.blue,
      categoricalViolet: color.categorical.violet,
      categoricalAmber: color.categorical.amber,
    },
    radius: {
      ...tamaguiDefaultConfig.tokens.radius,
      control: radius.control,
      card: radius.card,
      sheet: radius.sheet,
    },
  },
  /**
   * UI/UX pass — dark mode. Tamagui resolves a `$name` reference by
   * checking the ACTIVE THEME for a same-named key first, falling back to
   * the flat `tokens.color` entry above only if the theme doesn't define
   * it. Because every screen in this app already references color via
   * plain flat-token shorthand (`$neutral0`, `$neutral900`, `$accent600`,
   * etc.) rather than Tamagui's own semantic `$background`/`$color`
   * slots, defining a `dark` theme with the SAME key names is genuinely
   * enough to re-color every one of those ~700 existing references with
   * zero screen-level changes — this is the "config swap, not a rewrite"
   * the design-tokens file's own comment describes, and it's now actually
   * true rather than aspirational (previously `color.dark` only had 3 of
   * the ~14 keys screens actually use).
   *
   * ONE REAL, DISCLOSED LIMITATION: this re-colors every Tamagui-styled
   * prop (`color="$neutral900"`, `backgroundColor="$neutral0"`, border
   * colors, etc.) automatically, but NOT icon fills or SVG strokes that
   * read a raw hex value directly from `@dala/design-tokens`'s `color`
   * object in JS (e.g. `<MagnifyingGlassIcon color={color.neutral[500]}
   * />`, used throughout the app for Phosphor icons and in Chart.tsx/
   * Sparkline.tsx's SVG elements, because those props need a literal
   * color string, not a Tamagui token). Those bypass Tamagui's
   * theme-resolution entirely and will stay light-mode-colored even with
   * this theme active. Fixing that fully means threading Tamagui's
   * `useTheme()` hook through every icon call site across ~16 component
   * files — a real, separate piece of work, not done in this pass.
   */
  themes: {
    ...tamaguiDefaultConfig.themes,
    light: {
      ...tamaguiDefaultConfig.themes.light,
      accent600: color.accent[600],
      accent700: color.accent[700],
      accent50: color.accent[50],
      accent100: color.accent[100],
      neutral25: color.neutral[25],
      neutral100: color.neutral[100],
      neutral200: color.neutral[200],
      neutral300: color.neutral[300],
      neutral400: color.neutral[400],
      neutral500: color.neutral[500],
      neutral0: color.neutral[0],
      neutral900: color.neutral[900],
      success: color.status.success,
      warning: color.status.warning,
      danger: color.status.danger,
      warningTint: color.status.warningTint,
      categoricalBlue: color.categorical.blue,
      categoricalViolet: color.categorical.violet,
      categoricalAmber: color.categorical.amber,
    },
    dark: {
      // NOTE (Phase 19A, superseded 19F): `neutral400`/`warningTint` were
      // flagged here as missing their own contrast-audited dark values.
      // Migration 0090's sibling change (design-tokens' `color.dark`) has
      // now added both — `neutral400` unchanged (already clears AA at
      // both dark backgrounds), `warningTint` a darkened amber tint (see
      // design-tokens/src/index.ts's own comments for the actual
      // contrast-ratio numbers on each). Wired in below like every other
      // dark-mode key.
      ...tamaguiDefaultConfig.themes.dark,
      accent600: color.dark.accent600,
      accent700: color.dark.accent700,
      accent50: color.dark.accent50,
      accent100: color.dark.accent100,
      neutral25: color.dark.neutral25,
      neutral100: color.dark.neutral100,
      neutral200: color.dark.neutral200,
      neutral300: color.dark.neutral300,
      neutral400: color.dark.neutral400,
      neutral500: color.dark.neutral500,
      neutral0: color.dark.neutral0,
      neutral900: color.dark.neutral900,
      // WCAG AA-audited — see design-tokens' own comment on the dark
      // block for the actual contrast-ratio numbers. `success`/`danger`
      // differ from their light-mode values; `warning` doesn't need to.
      success: color.dark.success,
      warning: color.dark.warning,
      danger: color.dark.danger,
      warningTint: color.dark.warningTint,
      categoricalBlue: color.dark.categoricalBlue,
      categoricalViolet: color.dark.categoricalViolet,
      categoricalAmber: color.dark.categoricalAmber,
    },
  },
});

export type DalaTamaguiConfig = typeof dalaConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends DalaTamaguiConfig {}
}

export default dalaConfig;

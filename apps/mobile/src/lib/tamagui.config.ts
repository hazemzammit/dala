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
import { createTamagui } from 'tamagui';

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

const dalaConfig = createTamagui({
  ...tamaguiDefaultConfig,
  animations,
  tokens: {
    ...tamaguiDefaultConfig.tokens,
    color: {
      ...tamaguiDefaultConfig.tokens.color,
      accent600: color.accent[600],
      accent700: color.accent[700],
      accent50: color.accent[50],
      accent100: color.accent[100],
      neutral25: color.neutral[25],
      neutral100: color.neutral[100],
      neutral300: color.neutral[300],
      neutral500: color.neutral[500],
      neutral0: color.neutral[0],
      neutral900: color.neutral[900],
      success: color.status.success,
      warning: color.status.warning,
      danger: color.status.danger,
    },
    radius: {
      ...tamaguiDefaultConfig.tokens.radius,
      control: radius.control,
      card: radius.card,
      sheet: radius.sheet,
    },
  },
});

export type DalaTamaguiConfig = typeof dalaConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends DalaTamaguiConfig {}
}

export default dalaConfig;

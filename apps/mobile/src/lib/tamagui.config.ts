/**
 * apps/mobile/src/lib/tamagui.config.ts
 *
 * *** ALWAYS re-read this file's actual current contents before extending
 * it. Do not assume its shape from memory. *** (Same convention as
 * apps/web/src/lib/theme.ts — both wrap @dala/design-tokens, the single
 * source of truth for every color/spacing/radius value in the product.)
 */
import { color, radius } from '@dala/design-tokens';
import { config as tamaguiDefaultConfig } from '@tamagui/config';
import { createTamagui } from 'tamagui';


const dalaConfig = createTamagui({
  ...tamaguiDefaultConfig,
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

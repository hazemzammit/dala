import { View } from 'tamagui';

import { illustrations, type IllustrationName } from './illustrations';

/**
 * apps/mobile/src/components/ui/Illustration.tsx
 *
 * Every screen that needs an unDraw illustration goes through this
 * component rather than importing an SVG directly — keeps sizing (and any
 * future treatment, e.g. a fade-in) consistent across onboarding, empty
 * states, and confirmation moments instead of each screen picking its own
 * dimensions.
 */
interface IllustrationProps {
  name: IllustrationName;
  size?: number;
}

export function Illustration({ name, size = 180 }: IllustrationProps) {
  const Svg = illustrations[name];
  return (
    <View width={size} height={size} alignItems="center" justifyContent="center">
      {/* unDraw source SVGs aren't square (typically ~1.6:1) — letterbox
          via preserveAspectRatio rather than stretching to size×size. */}
      <Svg width={size} height={size} preserveAspectRatio="xMidYMid meet" />
    </View>
  );
}

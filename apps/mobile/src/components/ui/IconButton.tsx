import type { Icon } from 'phosphor-react-native';
import { styled, View } from 'tamagui';

import { useReducedMotion } from '@/lib/useReducedMotion';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/IconButton.tsx
 *
 * UI/UX pass (Chantiers audit) — promotes the hand-rolled 40×40 icon box
 * that `projects.tsx` built inline for its budget-filter trigger into a
 * real, reusable component. That inline version is the direct cause of
 * the search-bar/filter-button height mismatch you can see in the
 * Chantiers screenshot: the search field's height was implicit
 * (paddingVertical + text line-height + border, ≈37–38px) while the
 * filter box was a separately hardcoded `height={40}` — two unrelated
 * numbers that were never going to land on the same pixel.
 *
 * `SIZE` here is the ONE height/width IconButton will ever use, and
 * `SearchFilterBar` imports this same constant for its search field's
 * height — so the two controls are now structurally incapable of
 * drifting apart again. 44 also clears the 44dp minimum comfortable
 * touch target (Doc 05's own mobile-UX rule), which the previous 40px
 * box technically didn't quite hit.
 */
export const ICON_BUTTON_SIZE = 44;

const PressableIconButton = styled(View, {
  animation: 'press',
  pressStyle: { opacity: 0.85, scale: 0.94 },
});

interface IconButtonProps {
  icon: Icon;
  onPress: () => void;
  accessibilityLabel: string;
  /** Filled/active state — e.g. a filter that currently has a value set. */
  active?: boolean;
  /** Small dot in the corner — e.g. "N filters applied" without a number. */
  showDot?: boolean;
  size?: number;
}

export function IconButton({
  icon: IconComponent,
  onPress,
  accessibilityLabel,
  active = false,
  showDot = false,
  size = ICON_BUTTON_SIZE,
}: IconButtonProps) {
  const tc = useTokenColor();
  // Doc 05 §1.4b (Phase 19A) — same reduced-motion treatment as Button.
  const reducedMotion = useReducedMotion();

  return (
    <PressableIconButton
      width={size}
      height={size}
      borderRadius="$control"
      backgroundColor={active ? '$accent600' : '$neutral0'}
      borderWidth={1}
      borderColor={active ? '$accent600' : '$neutral300'}
      alignItems="center"
      justifyContent="center"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      animation={reducedMotion ? null : 'press'}
      pressStyle={reducedMotion ? { opacity: 0.7 } : { opacity: 0.85, scale: 0.94 }}
    >
      <IconComponent
        size={18}
        weight={active ? 'fill' : 'regular'}
        color={active ? '#FFFFFF' : tc.neutral900}
      />
      {showDot && !active && (
        <View
          position="absolute"
          top={7}
          right={7}
          width={7}
          height={7}
          borderRadius={999}
          backgroundColor="$accent600"
          borderWidth={1.5}
          borderColor="$neutral0"
        />
      )}
    </PressableIconButton>
  );
}

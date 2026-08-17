import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, XStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/SwipeableRow.tsx
 *
 * Every destructive/secondary row action in the app today is a small
 * tap-target icon (Team's trash can, 24-32px) — both less discoverable
 * than a swipe reveal and a worse target for the app's actual field-usage
 * context (site workers, sometimes gloved, tapping a phone outdoors).
 * `react-native-gesture-handler` is a new dependency this introduces
 * (Reanimated 4 was already present but nothing in the app used a gesture
 * beyond taps) — required peer for this, `Slider`, and Dispatch's planned
 * drag-and-drop.
 *
 * Deliberately hand-rolled rather than a full swipeable-list library: this
 * app only ever needs 1-2 revealed actions per row, not arbitrary
 * multi-action swipe stacks, so a small Pan gesture + translateX is enough
 * and keeps the dependency surface to gesture-handler alone.
 */
interface SwipeAction {
  label: string;
  color: string; // background color for the revealed action
  icon?: React.ComponentType<{ size: number; color: string }>;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  rightAction?: SwipeAction;
  actionWidth?: number;
}

export function SwipeableRow({ children, rightAction, actionWidth = 88 }: SwipeableRowProps) {
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-8, 8])
    .onUpdate((e: { translationX: number }) => {
      if (!rightAction) return;
      // Only allow a left-swipe (negative translate) to reveal the
      // right-side action — no left-side action exists yet, so clamp at 0.
      translateX.value = Math.max(-actionWidth, Math.min(0, e.translationX));
    })
    .onEnd((e: { translationX: number; velocityX: number }) => {
      if (!rightAction) return;
      const shouldOpen = e.translationX < -actionWidth / 2 || e.velocityX < -600;
      translateX.value = withSpring(shouldOpen ? -actionWidth : 0, { damping: 18, stiffness: 220 });
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function handleActionPress() {
    translateX.value = withTiming(0, { duration: 150 });
    rightAction?.onPress();
  }

  if (!rightAction) return <>{children}</>;

  const Icon = rightAction.icon;

  return (
    <View position="relative" overflow="hidden" borderRadius="$card">
      <View
        position="absolute"
        right={0}
        top={0}
        bottom={0}
        width={actionWidth}
        backgroundColor={rightAction.color}
        alignItems="center"
        justifyContent="center"
        onPress={handleActionPress}
        accessibilityRole="button"
        accessibilityLabel={rightAction.label}
      >
        <XStack alignItems="center" gap={4} flexDirection="column">
          {Icon && <Icon size={18} color="white" />}
          <Text fontSize={11.5} fontWeight="600" color="white">
            {rightAction.label}
          </Text>
        </XStack>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

// runOnJS kept imported for consumers extending this with a callback that
// must cross from the UI thread (Reanimated worklet) back to JS — not used
// internally yet since onPress on a plain View already runs on JS.
export { runOnJS };

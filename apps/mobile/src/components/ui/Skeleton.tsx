import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { View, XStack, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/Skeleton.tsx
 *
 * Doc 05's "no generic spinners for a screen with a known layout" —
 * skeletons should already look like the content that's about to load, so
 * the layout doesn't jump when real data arrives. `SkeletonBlock` is the
 * primitive (a pulsing neutral-100 rect); `SkeletonListRow` and
 * `SkeletonCard` are the two composed shapes reused across the app's
 * data-fetching screens (Team/Pointage's avatar+two-lines rows, Dispatch's
 * lane cards). Add new presets here rather than hand-rolling pulse logic
 * per screen.
 *
 * Uses RN's Animated (already a transitive dependency via react-native
 * itself — no new animation library needed for a simple opacity loop).
 */
function usePulse() {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

interface SkeletonBlockProps {
  width: number | `${number}%`;
  height: number;
  radius?: number;
}

export function SkeletonBlock({ width, height, radius = 6 }: SkeletonBlockProps) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{
        width: width as never,
        height,
        borderRadius: radius,
        backgroundColor: '#F2F2F3', // $neutral100 — kept literal, this is RN Animated.View, not a themed Tamagui node
        opacity,
      }}
    />
  );
}

/** Avatar circle + two lines — Team/Pointage worker rows. */
export function SkeletonListRow() {
  return (
    <XStack
      backgroundColor="$neutral0"
      borderRadius="$card"
      padding="$4"
      alignItems="center"
      gap="$3"
    >
      <SkeletonBlock width={40} height={40} radius={999} />
      <YStack gap="$2" flex={1}>
        <SkeletonBlock width="60%" height={15} />
        <SkeletonBlock width="35%" height={12} />
      </YStack>
    </XStack>
  );
}

/** Repeats SkeletonListRow, the shape every worker/vehicle list uses while loading. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <YStack gap="$2" padding="$4">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </YStack>
  );
}

/** Dispatch's lane-card shape: title row + 2 assignment rows. */
export function SkeletonCard() {
  return (
    <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$3" gap="$3">
      <XStack justifyContent="space-between" alignItems="center">
        <SkeletonBlock width="40%" height={16} />
        <SkeletonBlock width={70} height={13} />
      </XStack>
      <XStack alignItems="center" gap="$2">
        <SkeletonBlock width={26} height={26} radius={999} />
        <SkeletonBlock width="50%" height={13} />
      </XStack>
      <XStack alignItems="center" gap="$2">
        <SkeletonBlock width={26} height={26} radius={999} />
        <SkeletonBlock width="40%" height={13} />
      </XStack>
    </YStack>
  );
}

export function SkeletonCardList({ cards = 3 }: { cards?: number }) {
  return (
    <YStack gap="$3" padding="$4">
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </YStack>
  );
}

/** Worker home's single hero card + button shape. */
export function SkeletonHero() {
  return (
    <YStack padding="$4" gap="$4">
      <SkeletonBlock width="55%" height={23} />
      <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
        <SkeletonBlock width="70%" height={19} />
        <SkeletonBlock width="50%" height={14} />
        <XStack gap="$4">
          <SkeletonBlock width={90} height={13} />
          <SkeletonBlock width={90} height={13} />
        </XStack>
      </YStack>
      <View marginTop="$2">
        <SkeletonBlock width="100%" height={46} radius={12} />
      </View>
    </YStack>
  );
}

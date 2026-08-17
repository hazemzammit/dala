import { useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text, View, XStack } from 'tamagui';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Slider.tsx
 *
 * No slider existed anywhere in the app. First real use: a budget-consumed
 * threshold filter on Projects ("show chantiers over X% consumed"). Built
 * on `react-native-gesture-handler` + Reanimated (both already added for
 * `SwipeableRow`) rather than a slider library — a single-thumb 0-100
 * range is the only shape this app needs today.
 */
interface SliderProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  label?: string;
  trackWidth?: number;
  tintColor?: string;
}

const THUMB_SIZE = 22;

export function Slider({
  value,
  onChange,
  onChangeEnd,
  label,
  trackWidth = 280,
  tintColor,
}: SliderProps) {
  const tc = useTokenColor();
  const resolvedTint = tintColor ?? tc.accent600;
  const [width, setWidth] = useState(trackWidth);
  const position = useSharedValue((value / 100) * trackWidth);

  function clampToPercent(x: number): number {
    const clamped = Math.max(0, Math.min(x, width));
    return Math.round((clamped / width) * 100);
  }

  const pan = Gesture.Pan()
    .onUpdate((e: { x: number }) => {
      'worklet';
      const next = Math.max(0, Math.min(e.x, width));
      position.value = next;
    })
    .onEnd((e: { x: number }) => {
      'worklet';
      const next = Math.max(0, Math.min(e.x, width));
      const pct = clampToPercent(next);
      position.value = withSpring(next, { damping: 20, stiffness: 260 });
      if (onChange) {
        // Reporting back to JS from a worklet callback is fine for a plain
        // function invocation like this (no direct native-thread state
        // mutation) — Reanimated bridges it automatically.
        onChange(pct);
      }
      if (onChangeEnd) onChangeEnd(pct);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value - THUMB_SIZE / 2 }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: position.value,
  }));

  return (
    <View gap="$1.5">
      {label && (
        <XStack justifyContent="space-between">
          <Text fontSize={13} color="$neutral500">
            {label}
          </Text>
          <Text fontSize={13} fontWeight="600" color="$neutral900">
            {value}%
          </Text>
        </XStack>
      )}
      <View
        width={width}
        height={THUMB_SIZE}
        justifyContent="center"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <View
          height={4}
          borderRadius={2}
          backgroundColor={tc.neutral200}
          width="100%"
          position="absolute"
        />
        <Animated.View
          style={[
            { height: 4, borderRadius: 2, backgroundColor: resolvedTint, position: 'absolute' },
            fillStyle,
          ]}
        />
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: THUMB_SIZE / 2,
                backgroundColor: 'white',
                borderWidth: 2,
                borderColor: resolvedTint,
                position: 'absolute',
                shadowColor: '#111318',
                shadowOpacity: 0.15,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
              },
              thumbStyle,
            ]}
          />
        </GestureDetector>
      </View>
    </View>
  );
}

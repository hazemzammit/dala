import { useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { View, XStack } from 'tamagui';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Carousel.tsx
 *
 * Formalizes the ad-hoc `<ScrollView horizontal>` pattern already used in
 * Dashboard/Expenses/Journal's project-picker rows into a reusable
 * component with page-snap + dot indicator — the one piece those ad-hoc
 * rows never had (no sense of "which card am I on" once there are more
 * than fit on screen).
 *
 * `itemWidth` + `gap` drive the snap interval so a card is always
 * center/edge-aligned after a swipe rather than stopping mid-card.
 */
interface CarouselProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemWidth: number;
  gap?: number;
  showDots?: boolean;
  keyExtractor: (item: T, index: number) => string;
  contentPaddingHorizontal?: number;
}

export function Carousel<T>({
  data,
  renderItem,
  itemWidth,
  gap = 10,
  showDots = true,
  keyExtractor,
  contentPaddingHorizontal = 16,
}: CarouselProps<T>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tc = useTokenColor();
  const snapInterval = itemWidth + gap;

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / snapInterval);
    setActiveIndex(Math.max(0, Math.min(index, data.length - 1)));
  }

  if (data.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScroll}
        contentContainerStyle={{ paddingHorizontal: contentPaddingHorizontal, gap }}
      >
        {data.map((item, index) => (
          <View key={keyExtractor(item, index)} width={itemWidth}>
            {renderItem(item, index)}
          </View>
        ))}
      </ScrollView>

      {showDots && data.length > 1 && (
        <XStack justifyContent="center" gap={5} marginTop="$2.5">
          {data.map((_, i) => (
            <View
              key={i}
              width={i === activeIndex ? 16 : 6}
              height={6}
              borderRadius={3}
              backgroundColor={i === activeIndex ? tc.accent600 : tc.neutral200}
            />
          ))}
        </XStack>
      )}
    </View>
  );
}

/** Screen width helper, used for full-bleed single-card carousels. */
export const screenWidth = Dimensions.get('window').width;

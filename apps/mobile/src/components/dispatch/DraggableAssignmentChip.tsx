import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { View } from 'tamagui';

/**
 * apps/mobile/src/components/dispatch/DraggableAssignmentChip.tsx
 *
 * Drag-and-drop between vehicle lanes — see dispatch.tsx's own file-header
 * UI/UX-pass note for the reasoning on why this exists as its own
 * dedicated pass rather than a bolt-on, and why it funnels every write
 * through the exact same conflict-safe `submitAssignmentPatch` core the
 * sheet-driven edit path uses (`handleDragReassign`, in dispatch.tsx).
 * This component owns ONLY the gesture and the visual lift/drop
 * animation — it never touches Supabase directly.
 *
 * LONG-PRESS-THEN-DRAG, not immediate-drag: the chip lives inside a
 * vertical ScrollView (the lane list). A Pan gesture that activates
 * immediately on touch-down would compete with the ScrollView's own
 * vertical scroll gesture for every ordinary scroll — the standard fix
 * (used in gesture-handler's own reorderable-list examples) is to gate
 * the Pan's effect behind a LongPress that "arms" dragging first, via a
 * shared boolean checked inside the Pan's worklet. A quick vertical swipe
 * still scrolls the list normally; only a hold-then-move triggers a drag.
 *
 * Drop-target detection: `laneBoundsRef` (owned by dispatch.tsx, passed
 * down) holds each lane's live absolute-window Y bounds, refreshed via
 * `measureInWindow` on layout. On release, the gesture's `e.absoluteY` is
 * compared against those bounds — this stays in the same coordinate space
 * gesture-handler already reports touches in, so no extra scroll-offset
 * bookkeeping is needed.
 */
interface DraggableAssignmentChipProps {
  children: React.ReactNode;
  laneId: string | null;
  laneBoundsRef: React.MutableRefObject<Record<string, { top: number; bottom: number }>>;
  disabled: boolean;
  isSaving: boolean;
  onDrop: (targetLaneId: string | null) => void;
}

const LANE_KEY = (id: string | null) => id ?? 'none';

export function DraggableAssignmentChip({
  children,
  laneId,
  laneBoundsRef,
  disabled,
  isSaving,
  onDrop,
}: DraggableAssignmentChipProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  function resolveDropLane(absoluteY: number) {
    for (const [key, bounds] of Object.entries(laneBoundsRef.current)) {
      if (absoluteY >= bounds.top && absoluteY <= bounds.bottom) {
        return key === 'none' ? null : key;
      }
    }
    return undefined; // released outside any known lane — treat as no-op
  }

  function handleRelease(absoluteY: number) {
    const targetKey = resolveDropLane(absoluteY);
    if (targetKey === undefined) return; // dropped outside any lane
    if (LANE_KEY(targetKey) === LANE_KEY(laneId)) return; // dropped back on its own lane
    onDrop(targetKey);
  }

  // No tap-handling here at all, deliberately: the child passed in below
  // (dispatch.tsx's existing chip row) keeps its own `onPress` untouched.
  // A fast tap never crosses LongPress's 280ms threshold or Pan's
  // movement threshold, so gesture-handler never claims it and the
  // underlying `onPress` still fires normally — reimplementing tap
  // detection here would risk double-firing against that existing handler
  // for no benefit.
  const longPress = Gesture.LongPress()
    .enabled(!disabled)
    .minDuration(280)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.05, { damping: 14, stiffness: 260 });
    });

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((e) => {
      if (!isDragging.value) return;
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const wasDragging = isDragging.value;
      isDragging.value = false;
      scale.value = withSpring(1, { damping: 16, stiffness: 260 });
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      if (wasDragging) {
        runOnJS(handleRelease)(e.absoluteY);
      }
    });

  const composed = Gesture.Simultaneous(longPress, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: isDragging.value ? 10 : 0,
    shadowColor: '#111318',
    shadowOpacity: isDragging.value ? 0.18 : 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: isDragging.value ? 6 : 0,
    opacity: isSaving ? 0.5 : 1,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={animatedStyle}>
        <View>{children}</View>
      </Animated.View>
    </GestureDetector>
  );
}

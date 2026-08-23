import { ArrowCounterClockwiseIcon, CheckCircleIcon } from 'phosphor-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, XStack } from 'tamagui';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/UndoToast.tsx
 *
 * IMPROVEMENT-PLAN PHASE 11 (§9.2) — "For lower-stakes deletes (a journal
 * entry, an expense row), replace the modal confirm with a lighter
 * 'Supprimé · Annuler' toast with a short undo window — save the modal
 * confirm for genuinely hard-to-reverse actions."
 *
 * Read `Toast.tsx` in full before building this, per this phase's own
 * read-before-write instruction. `useToast()`'s three variants
 * (success/error/info) are message-only, fixed 3.5s auto-dismiss, no action
 * button — confirmed by reading its own `ToastContextValue`/`ToastItem`
 * shapes, not assumed. Extending that context with an optional `action`
 * would touch every existing `toast.success('...')` call site's type
 * (all ~15+ of them across the app) for a feature only two screens need
 * this phase — a second, small, PARALLEL component was the smaller diff,
 * mirroring how `pointage.tsx`'s own "Marquer tous présents" 5s-undo
 * already solved this same shape LOCALLY (inline state, not a shared
 * component) rather than through `useToast()`. This component generalizes
 * that inline pattern into something `journal.tsx`/`expenses.tsx` can both
 * reuse, rather than each hand-rolling a third copy of it.
 *
 * NOT a `ToastProvider`-mounted singleton — deliberately rendered INLINE by
 * each screen that needs it (same "one row, screen-local state" shape
 * `pointage.tsx`'s own undoSnapshot already uses), because the action this
 * undoes is screen-specific (restore one journal entry / one expense row),
 * not a generic message. A caller manages its own `visible`/`onUndo`/
 * `message` state; this component only owns the countdown + auto-fire-of-
 * the-real-delete-once-the-window-lapses timing.
 *
 * TIMING MODEL, stated explicitly since it differs from `Toast.tsx`'s own
 * fire-and-forget auto-dismiss: the actual soft-delete RPC call
 * (`soft_delete_site_log`/`soft_delete_expense`) already ran BEFORE this
 * component mounts — "undo" means calling the matching `restore_*` RPC,
 * not "cancel a pending delete." This is the standard "optimistic delete,
 * generous undo window" pattern: the row disappears from the list
 * immediately (matches user expectation of instant feedback), and tapping
 * "Annuler" within the window reverses it via a second RPC call. If the
 * window elapses unactioned, nothing further happens here — the row stays
 * soft-deleted server-side, exactly as it already was the instant the
 * toast appeared. This is why `onUndo` is `() => Promise<void>` (a real
 * network call), not a purely local state restore like
 * `pointage.tsx`'s `undoMarkAllPresent()`.
 */
const DEFAULT_WINDOW_MS = 6000;

interface UndoToastProps {
  visible: boolean;
  message: string;
  onUndo: () => void | Promise<void>;
  onExpire: () => void;
  windowMs?: number;
}

export function UndoToast({
  visible,
  message,
  onUndo,
  onExpire,
  windowMs = DEFAULT_WINDOW_MS,
}: UndoToastProps) {
  const tc = useTokenColor();
  const translateY = useSharedValue(24);
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoing, setUndoing] = useState(false);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  // Mount/re-mount animation + expiry timer. `visible` flipping true->false
  // then true again (a second delete while the first's toast is still up)
  // restarts the window rather than extending it — same "most recent action
  // wins" behavior pointage.tsx's own undoSnapshot already has for repeated
  // "Marquer tous présents" taps.
  if (visible && translateY.value !== 0) {
    translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 200 });
    clearTimer();
    dismissTimer.current = setTimeout(() => runOnJS(onExpire)(), windowMs);
  }

  async function handleUndo() {
    clearTimer();
    setUndoing(true);
    try {
      await onUndo();
    } finally {
      setUndoing(false);
    }
  }

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[style, { position: 'absolute', left: 16, right: 16, bottom: 24 }]}>
      <XStack
        alignItems="center"
        justifyContent="space-between"
        backgroundColor="$neutral900"
        borderRadius="$card"
        paddingVertical={12}
        paddingHorizontal={14}
        shadowColor="#000"
        shadowOpacity={0.18}
        shadowRadius={10}
        shadowOffset={{ width: 0, height: 4 }}
        elevation={4}
      >
        <XStack alignItems="center" gap="$2" flex={1}>
          <CheckCircleIcon size={18} weight="fill" color={tc.success} />
          <Text fontSize={13.5} color="white" flex={1}>
            {message}
          </Text>
        </XStack>
        <Pressable
          onPress={() => void handleUndo()}
          disabled={undoing}
          accessibilityRole="button"
          accessibilityLabel="Annuler la suppression"
        >
          <XStack alignItems="center" gap={4} opacity={undoing ? 0.5 : 1}>
            <ArrowCounterClockwiseIcon size={15} weight="bold" color="white" />
            <Text fontSize={13.5} fontWeight="700" color="white">
              Annuler
            </Text>
          </XStack>
        </Pressable>
      </XStack>
    </Animated.View>
  );
}

/**
 * Convenience hook bundling the visible/message/onUndo state trio most call
 * sites need, so `journal.tsx`/`expenses.tsx` don't each re-declare the same
 * three `useState`s. Deliberately NOT a React Context/Provider (see file
 * header — this is screen-local, not a global singleton).
 */
interface UndoState {
  id: string;
  message: string;
}

export function useUndoToast() {
  const [pending, setPending] = useState<UndoState | null>(null);

  const show = useCallback((id: string, message: string) => {
    setPending({ id, message });
  }, []);

  const clear = useCallback(() => setPending(null), []);

  return { pending, show, clear };
}

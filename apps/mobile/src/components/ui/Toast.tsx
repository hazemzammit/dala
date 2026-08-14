import { color } from '@dala/design-tokens';
import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from 'phosphor-react-native';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, View, XStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/Toast.tsx
 *
 * Phase 24/25 — Doc 05 §4 speced a `ConflictToast` ("auto-dismiss 4s, manual
 * dismiss always available") but it was only ever built for the one
 * dispatch-conflict case. Every other "operation succeeded" / "operation
 * failed" moment across the app (50 call sites as of the Phase 23 audit)
 * used the native `Alert.alert` instead — a blocking dialog that requires a
 * tap to dismiss, which is a heavy interruption for a disposable "saved"
 * confirmation. This generalizes that one-off pattern into the reusable
 * primitive Doc 05 always intended, on top of react-native-reanimated
 * (already a dependency — no new native module).
 *
 * Usage: `const toast = useToast(); toast.success('Véhicule ajouté.');`
 * Mounted once via `<ToastProvider>` in app/_layout.tsx, same pattern as
 * OfflineBanner/AutoSync.
 *
 * Reserve `Alert.alert`/`ConfirmDialog` for destructive actions that need an
 * explicit confirm tap — this component is for disposable notices only.
 */
type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: typeof CheckCircleIcon; color: string; background: string }
> = {
  success: { icon: CheckCircleIcon, color: color.status.success, background: '#EAF7EF' },
  error: { icon: WarningCircleIcon, color: color.status.danger, background: '#FBEAE9' },
  info: { icon: InfoIcon, color: color.accent[600], background: color.accent[50] },
};

const AUTO_DISMISS_MS = 3500;

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const translateY = useSharedValue(-24);
  const opacity = useSharedValue(0);
  const config = VARIANT_CONFIG[item.variant];
  const Icon = config.icon;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enter animation + auto-dismiss timer, both fired once per mounted row.
  if (translateY.value === -24) {
    translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 220 });
    dismissTimer.current = setTimeout(() => handleDismiss(), AUTO_DISMISS_MS);
  }

  function handleDismiss() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    opacity.value = withTiming(0, { duration: 160 });
    translateY.value = withTiming(-16, { duration: 160 }, (finished) => {
      if (finished) runOnJS(onDismiss)(item.id);
    });
  }

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style}>
      <Pressable onPress={handleDismiss} accessibilityRole="button" accessibilityLabel="Fermer">
        <XStack
          alignItems="center"
          gap="$2.5"
          backgroundColor={config.background}
          borderRadius="$card"
          paddingVertical={12}
          paddingHorizontal={14}
          marginBottom={8}
          shadowColor="#000"
          shadowOpacity={0.12}
          shadowRadius={10}
          shadowOffset={{ width: 0, height: 4 }}
          elevation={4}
        >
          <Icon size={20} weight="fill" color={config.color} />
          <Text flex={1} fontSize={14.5} fontWeight="500" color={config.color}>
            {item.message}
          </Text>
          <View onPress={handleDismiss} accessibilityRole="button" accessibilityLabel="Fermer">
            <XIcon size={16} color={config.color} />
          </View>
        </XStack>
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((variant: ToastVariant, message: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message, variant }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Fixed to the top, below the status bar / OfflineBanner — stacks
          top-to-bottom as more toasts fire, oldest on top. */}
      <View position="absolute" top={12} left={16} right={16} pointerEvents="box-none">
        {items.map((item) => (
          <ToastRow key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be called within <ToastProvider>.');
  }
  return ctx;
}

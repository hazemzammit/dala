import { useRef, useState } from 'react';
import { Modal, Pressable, View as RNView } from 'react-native';
import { Text, View, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/Popover.tsx
 *
 * Small anchored menu — row "..." actions, filter refinement panels.
 * Nothing in the app had this shape yet: every secondary action today is
 * either a bare inline icon (Team's trash can) or a full bottom `Sheet`,
 * which is the right container for a form but heavyweight for "3 menu
 * items anchored to a button."
 *
 * Deliberately positioned via a measured anchor (`onLayout` + `measure`)
 * rather than a real portal/floating-ui layer — this app's popovers are
 * always triggered by a single on-screen button, never need
 * collision-aware repositioning against scroll containers, so the simpler
 * approach is enough and keeps this dependency-free.
 */
interface PopoverProps {
  visible: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<RNView | null>;
  children: React.ReactNode;
  /** 'end' aligns the popover's right edge to the anchor's right edge
   * (the common case for a trailing "..." button); 'start' aligns left. */
  align?: 'start' | 'end';
  width?: number;
  /** Gap between the anchor's bottom edge and the popover's top edge, in
   * px. Default (6) is enough when nothing else sits between the anchor
   * and where the popover should open. Doc 05 phase-17 audit / Phase 19D
   * — Projects list's filter popover is anchored to the filter BUTTON,
   * but a whole filter-chip row (dynamic height, wraps by content) sits
   * between that button and where the list actually starts; the default
   * 6px only cleared the button, not the chip row below it, so the
   * popover visually cut across the "Tous" chip. This screen passes a
   * larger explicit value instead. Per this file's own header comment,
   * Popover deliberately doesn't do live collision-aware repositioning
   * against other on-screen elements — this stays a static, per-call-site
   * number, not a second measurement of the chip row's actual height. */
  verticalOffset?: number;
}

export function Popover({
  visible,
  onClose,
  anchorRef,
  children,
  align = 'end',
  width = 200,
  verticalOffset = 6,
}: PopoverProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  function measureAndShow() {
    anchorRef.current?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
      setPosition({
        top: y + h + verticalOffset,
        left: align === 'end' ? x + w - width : x,
      });
    });
  }

  // Measure right before the modal paints so position is fresh each open.
  if (visible && !position) measureAndShow();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        style={{ flex: 1 }}
        onPress={() => {
          onClose();
          setPosition(null);
        }}
      >
        {position && (
          <YStack
            position="absolute"
            top={position.top}
            left={Math.max(12, position.left)}
            width={width}
            backgroundColor="$neutral0"
            borderRadius="$control"
            padding="$1.5"
            shadowColor="#111318"
            shadowOpacity={0.12}
            shadowRadius={16}
            shadowOffset={{ width: 0, height: 8 }}
            elevation={6}
          >
            {children}
          </YStack>
        )}
      </Pressable>
    </Modal>
  );
}

/** A single tappable row inside a Popover — consistent padding/typography
 * so every menu (row actions, filter options) looks the same. */
export function PopoverItem({
  label,
  onPress,
  destructive = false,
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: React.ComponentType<{ size: number; color: string }>;
}) {
  return (
    <View
      flexDirection="row"
      alignItems="center"
      gap={10}
      paddingVertical={10}
      paddingHorizontal={10}
      borderRadius={8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {Icon && <Icon size={17} color={destructive ? '#C0433D' : '#111318'} />}
      <Text fontSize={14.5} fontWeight="500" color={destructive ? '$danger' : '$neutral900'}>
        {label}
      </Text>
    </View>
  );
}

// Kept useRef import used for consumers that want the typed anchor ref
// shape without redefining it per screen.
export function usePopoverAnchor() {
  return useRef<RNView | null>(null);
}

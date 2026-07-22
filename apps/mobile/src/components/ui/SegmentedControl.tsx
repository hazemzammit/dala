import { Text, XStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/SegmentedControl.tsx
 *
 * A small generic N-option toggle. First concrete use: Pointage's
 * Présent/Absent/Demi-journée per-worker row (Doc 02 §2.2a). Kept generic
 * (string value/label pairs) rather than hardcoded to attendance status, in
 * case a later screen needs the same 3-segment control shape.
 */
interface Option<T extends string> {
  value: T;
  label: string;
  color: string; // token string, e.g. '$success'
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <XStack backgroundColor="$neutral100" borderRadius="$control" padding={2} gap={2}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <XStack
            key={option.value}
            flex={1}
            paddingVertical={7}
            alignItems="center"
            justifyContent="center"
            borderRadius={10}
            backgroundColor={active ? '$neutral0' : 'transparent'}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              fontSize={13}
              fontWeight={active ? '600' : '400'}
              color={active ? option.color : '$neutral500'}
            >
              {option.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

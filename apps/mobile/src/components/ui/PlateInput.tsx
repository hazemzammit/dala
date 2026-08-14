import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Input, Text, XStack, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/PlateInput.tsx
 *
 * Phase 26 — vehicles.tsx previously used a plain `FormField` free-text
 * input for "Plaque d'immatriculation," per the Phase 23/24 UI audit's
 * named example. Tunisian civilian plates follow a fixed shape —
 * `NNN TUN NNNN` (left group up to 3 digits, the literal "TUN," right group
 * up to 4 digits) — so this renders that shape directly rather than asking
 * for free text: a left numeric field, a non-editable "TUN" chip, a right
 * numeric field, auto-advancing focus between them like a native OTP input.
 *
 * Non-civilian plates (rental "RS", official "RE", older/tourism series)
 * exist but are the minority case — `allowFreeform` renders a plain text
 * fallback for those, toggled by the "Autre format" link, so this doesn't
 * block on a format the component doesn't model.
 *
 * Canonical stored value: `"123 TUN 4567"` (matches what the physical plate
 * reads) — composed on blur/save, not on every keystroke, so partial entry
 * mid-typing never gets written upstream.
 */
interface PlateInputProps {
  /** Canonical value, e.g. "123 TUN 4567", or freeform text if not civilian shape. */
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}

const CIVILIAN_PLATE_REGEX = /^(\d{1,3})\s*TUN\s*(\d{1,4})$/i;

function parseCivilian(value: string): { left: string; right: string } | null {
  const match = value.trim().match(CIVILIAN_PLATE_REGEX);
  if (!match) return null;
  return { left: match[1]!, right: match[2]! };
}

export function PlateInput({ value, onChangeText, error }: PlateInputProps) {
  const parsed = parseCivilian(value);
  const [freeform, setFreeform] = useState(value.length > 0 && !parsed);
  const [left, setLeft] = useState(parsed?.left ?? '');
  const [right, setRight] = useState(parsed?.right ?? '');
  const rightRef = useRef<TextInput>(null);
  const leftRef = useRef<TextInput>(null);

  function emit(nextLeft: string, nextRight: string) {
    if (nextLeft || nextRight) {
      onChangeText(`${nextLeft} TUN ${nextRight}`.trim());
    } else {
      onChangeText('');
    }
  }

  function handleLeftChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 3);
    setLeft(digits);
    emit(digits, right);
    if (digits.length === 3) rightRef.current?.focus();
  }

  function handleRightChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setRight(digits);
    emit(left, digits);
  }

  function handleRightKeyPress(key: string) {
    if (key === 'Backspace' && right.length === 0) {
      leftRef.current?.focus();
    }
  }

  const borderColor = error ? '$danger' : '$neutral300';

  if (freeform) {
    return (
      <YStack gap="$1.5">
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize={14} fontWeight="500" color="$neutral900">
            Plaque d'immatriculation
          </Text>
          <Text
            fontSize={13}
            color="$accent600"
            fontWeight="500"
            onPress={() => {
              setFreeform(false);
              onChangeText('');
            }}
            accessibilityRole="button"
          >
            Format standard
          </Text>
        </XStack>
        <Input
          borderRadius="$control"
          borderColor={borderColor}
          borderWidth={1}
          backgroundColor="$neutral0"
          paddingHorizontal={12}
          paddingVertical={10}
          fontSize={15.5}
          placeholder="Ex: RS 123456"
          value={value}
          onChangeText={onChangeText}
        />
        {error && (
          <Text fontSize={13} color="$danger">
            {error}
          </Text>
        )}
      </YStack>
    );
  }

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="500" color="$neutral900">
        Plaque d'immatriculation
      </Text>

      <XStack alignItems="center" gap="$2">
        <Input
          ref={leftRef}
          width={64}
          textAlign="center"
          borderRadius="$control"
          borderColor={borderColor}
          borderWidth={1}
          backgroundColor="$neutral0"
          paddingVertical={10}
          fontSize={17}
          fontWeight="600"
          keyboardType="number-pad"
          maxLength={3}
          placeholder="123"
          value={left}
          onChangeText={handleLeftChange}
          accessibilityLabel="Numéro gauche de la plaque"
        />

        <XStack
          alignItems="center"
          justifyContent="center"
          paddingHorizontal={12}
          paddingVertical={10}
          borderRadius="$control"
          backgroundColor="$neutral100"
        >
          <Text fontSize={15} fontWeight="700" color="$neutral900" letterSpacing={1}>
            TUN
          </Text>
        </XStack>

        <Input
          ref={rightRef}
          flex={1}
          textAlign="center"
          borderRadius="$control"
          borderColor={borderColor}
          borderWidth={1}
          backgroundColor="$neutral0"
          paddingVertical={10}
          fontSize={17}
          fontWeight="600"
          keyboardType="number-pad"
          maxLength={4}
          placeholder="4567"
          value={right}
          onChangeText={handleRightChange}
          onKeyPress={(e) => handleRightKeyPress(e.nativeEvent.key)}
          accessibilityLabel="Numéro droit de la plaque"
        />
      </XStack>

      <Text
        fontSize={13}
        color="$accent600"
        fontWeight="500"
        onPress={() => setFreeform(true)}
        accessibilityRole="button"
      >
        Autre format (location, officielle...)
      </Text>

      {error && (
        <Text fontSize={13} color="$danger">
          {error}
        </Text>
      )}
    </YStack>
  );
}

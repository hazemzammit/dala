import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ClockIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/TimeInput.tsx
 *
 * Phase 26 — dispatch.tsx's "Heure de départ" was previously a plain
 * `FormField` free-text input (`placeholder="07:30"`,
 * `keyboardType="numbers-and-punctuation"`) — per the Phase 23/24 UI audit's
 * named example, a user could type anything, including malformed values
 * that only failed at sync time against `timeStringSchema`
 * (packages/validation/src/dispatch.ts). This replaces free text with the
 * native picker, so a malformed time can no longer be entered at all.
 *
 * `@react-native-community/datetimepicker` — Expo's own recommended native
 * date/time package — is the one new dependency this introduces (see the
 * Phase 23/24 audit doc §4/§8 for why this is the one new native module
 * worth adding despite WatermelonDB's still-unverified native linking).
 *
 * Platform behavior differs deliberately, matching each OS's own
 * convention rather than forcing one shared UI:
 *   - Android: the native picker is itself a dialog — rendering it
 *     conditionally is enough, no extra sheet wrapper needed.
 *   - iOS: the native picker is inline-only (no built-in dialog chrome), so
 *     it's hosted inside the existing `Sheet` with an explicit "Terminé".
 */
interface TimeInputProps {
  label: string;
  /** "HH:MM" 24h string, or null/empty if unset. */
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

function parseHHMM(value: string | null): Date {
  const now = new Date();
  if (!value) {
    now.setSeconds(0, 0);
    return now;
  }
  const [h, m] = value.split(':').map(Number);
  now.setHours(h ?? 0, m ?? 0, 0, 0);
  return now;
}

function formatHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function TimeInput({
  label,
  value,
  onChange,
  error,
  placeholder = 'Sélectionner',
}: TimeInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // iOS-only: staged value while the sheet is open, committed on "Terminé"
  // so dragging the wheel doesn't write on every tick.
  const [draft, setDraft] = useState<Date>(() => parseHHMM(value));
  const tc = useTokenColor();

  const borderColor = error ? '$danger' : '$neutral300';

  function openPicker() {
    setDraft(parseHHMM(value));
    setPickerOpen(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    setPickerOpen(false);
    if (event.type === 'set' && selected) {
      onChange(formatHHMM(selected));
    }
  }

  function handleIOSConfirm() {
    onChange(formatHHMM(draft));
    setPickerOpen(false);
  }

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="500" color="$neutral900">
        {label}
      </Text>

      <XStack
        alignItems="center"
        gap="$2"
        borderRadius="$control"
        borderColor={borderColor}
        borderWidth={1}
        backgroundColor="$neutral0"
        paddingHorizontal={12}
        paddingVertical={10}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ?? 'non défini'}`}
      >
        <ClockIcon size={18} color={tc.neutral500} />
        <Text fontSize={15.5} color={value ? '$neutral900' : '$neutral500'}>
          {value ?? placeholder}
        </Text>
      </XStack>

      {error && (
        <Text fontSize={13} color="$danger">
          {error}
        </Text>
      )}

      {pickerOpen && Platform.OS === 'android' && (
        <DateTimePicker
          value={draft}
          mode="time"
          is24Hour
          display="default"
          onChange={handleAndroidChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Sheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title={label}
          scroll={false}
        >
          <YStack gap="$4">
            <DateTimePicker
              value={draft}
              mode="time"
              is24Hour
              display="spinner"
              onChange={(_, selected) => selected && setDraft(selected)}
            />
            <Button onPress={handleIOSConfirm}>Terminé</Button>
          </YStack>
        </Sheet>
      )}
    </YStack>
  );
}

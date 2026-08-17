import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/DatePicker.tsx
 *
 * Same reasoning and same structure as `TimeInput.tsx` (Phase 26) — that
 * component replaced Dispatch's free-text time field with the native
 * picker; this closes the equivalent gap that was never done for dates.
 * Two real screens still take a raw "AAAA-MM-JJ" typed string today
 * (Expenses' expense-date field, Projects' new-chantier start-date field)
 * — both accepted a malformed string with only a client-side regex/format
 * check, no actual calendar UI. `@react-native-community/datetimepicker`
 * is already a dependency (added for TimeInput) — no new native module.
 *
 * Platform behavior mirrors TimeInput exactly: Android's picker is its own
 * dialog; iOS is inline-only, hosted in the existing `Sheet` with a
 * "Terminé" confirm so dragging the wheel doesn't commit on every tick.
 */
interface DatePickerProps {
  label: string;
  /** "YYYY-MM-DD", or null/empty if unset. */
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
}

function parseISO(value: string | null): Date {
  if (!value) return new Date();
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Human-readable display ("14 août 2026") — used for the trigger's own
 * label so the field reads naturally without abandoning the ISO value the
 * rest of the app (and Supabase's `date` columns) expects. */
function formatDisplay(value: string | null): string | null {
  if (!value) return null;
  const date = parseISO(value);
  return date.toLocaleDateString('fr-TN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function DatePicker({
  label,
  value,
  onChange,
  error,
  placeholder = 'Sélectionner une date',
  maximumDate,
  minimumDate,
}: DatePickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => parseISO(value));
  const tc = useTokenColor();

  const borderColor = error ? '$danger' : '$neutral300';

  function openPicker() {
    setDraft(parseISO(value));
    setPickerOpen(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    setPickerOpen(false);
    if (event.type === 'set' && selected) {
      onChange(formatISO(selected));
    }
  }

  function handleIOSConfirm() {
    onChange(formatISO(draft));
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
        accessibilityLabel={`${label}, ${formatDisplay(value) ?? 'non défini'}`}
      >
        <CalendarIcon size={18} color={tc.neutral500} />
        <Text
          fontSize={15.5}
          color={value ? '$neutral900' : '$neutral500'}
          textTransform="capitalize"
        >
          {formatDisplay(value) ?? placeholder}
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
          mode="date"
          display="default"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
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
              mode="date"
              display="spinner"
              maximumDate={maximumDate}
              minimumDate={minimumDate}
              onChange={(_, selected) => selected && setDraft(selected)}
            />
            <Button onPress={handleIOSConfirm}>Terminé</Button>
          </YStack>
        </Sheet>
      )}
    </YStack>
  );
}

import type { Icon } from 'phosphor-react-native';
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Sheet } from '@/components/ui/Sheet';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Select.tsx
 *
 * IMPROVEMENT-PLAN PHASE 4 (§3) — "there is no Select/Picker/Autocomplete
 * component anywhere in the UI kit." This closes that gap: one bottom-sheet
 * pick-or-specify component, reused at every call site §3's table lists
 * (trade_type, worker trade, insurance coverage type, safety incident type,
 * material name, absence reason) rather than six bespoke pickers.
 *
 * Modeled on `DatePicker.tsx`'s already-established sheet pattern, per the
 * plan's own explicit instruction — same trigger shape (label above a
 * bordered row, tapping it opens a `Sheet`), same "confirm" affordance for
 * anything that isn't an instant single-tap choice. Two differences from
 * DatePicker, both because a list of options isn't a native date wheel:
 *   - the sheet's BODY is this component's own (a search field + a plain
 *     option list), not a native `DateTimePicker`, so there's only one
 *     code path here, not an iOS/Android split.
 *   - picking a PRESET option commits immediately and closes the sheet
 *     (matching a normal picker's feel — no reason to make someone tap
 *     twice to choose "Plomberie"). Only the "Autre — préciser" row opens
 *     a second, in-sheet step (an inline `FormField` + a "Terminé" confirm
 *     button) — DatePicker's "Terminé" pattern reused for exactly the one
 *     case here that also needs a confirm step, not applied to the whole
 *     component.
 *
 * JUDGMENT CALL — how the custom ("Autre") value is stored: every field
 * this component is applied to (`organizations.trade_type`,
 * `workers.trade`, `org_insurances.coverage_type`, the new
 * `safety_incidents.incident_type`, the worker-request `materials.item`,
 * the new `attendance_records.absence_reason`) is, and remains, a single
 * plain `text` column — none of them gained a second "is_other"/
 * "custom_value" column. A custom value picked via "Autre" is written
 * directly into that same column, as free text, exactly the way the field
 * already worked before this component existed. This keeps the change to
 * "add a picker UI in front of an existing text field," per the plan's
 * own framing, rather than a schema change on top of it — the trade-off,
 * disclosed rather than silently accepted, is that a value that happens to
 * collide with an option's own label (someone free-typing exactly
 * "Plomberie" into "Autre") is indistinguishable on read from having
 * picked "Plomberie" from the list — which is fine, since they ARE the
 * same value for every purpose this component serves (display, and future
 * chart grouping by exact string).
 *
 * SEARCH THRESHOLD — "search-as-you-type for longer lists" (§3's own
 * wording, no exact number given). `SEARCH_THRESHOLD = 6` is this file's
 * own judgment call: below that, scrolling a short list is faster than
 * typing; the one call site that actually crosses it today is the
 * trade-type list (11 options + "Autre" = 12 rows) — every other list
 * this phase wires up (insurance coverage, incident type, absence reason)
 * has 4-6 preset options and renders as a plain scrollable list, matching
 * how DatePicker's own iOS spinner needs no search field for 12 months or
 * 31 days — a short, ordered list doesn't benefit from a search box either.
 */
const SEARCH_THRESHOLD = 6;
const OTHER_VALUE = '__other__';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  /** The stored value — either one of `options`' own `value`s, or any
   * other non-empty string (a previously free-typed "Autre" value), or
   * null/empty if unset. */
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  /** Label for the free-text row, e.g. "Autre — préciser". */
  otherLabel?: string;
  /** Leading icon, rendered left of the value text — matches
   * `DatePicker`'s icon-row and `FormField`'s new `icon` prop (Round 2
   * audit §1.12), so `Select` finally picks up the leading icon its own
   * header comment says it was modeled on `DatePicker` for but never got. */
  icon?: Icon;
}

export function Select({
  label,
  value,
  onChange,
  options,
  error,
  placeholder = 'Sélectionner',
  otherLabel = 'Autre — préciser',
  icon: IconComponent,
}: SelectProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customDraft, setCustomDraft] = useState('');
  const [editingCustom, setEditingCustom] = useState(false);
  const tc = useTokenColor();

  const borderColor = error ? '$danger' : '$neutral300';
  const showSearch = options.length > SEARCH_THRESHOLD;

  // A stored value that doesn't match any preset's own `value` is a
  // previously free-typed "Autre" entry — displayed as itself (it already
  // IS the display text), not resolved through the options list.
  const matchedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );
  const displayText = value ? (matchedOption?.label ?? value) : null;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function openSheet() {
    setQuery('');
    // Pre-seed the custom draft with the current value ONLY when it's
    // already a free-typed ("Autre") value — reopening the sheet to tweak
    // a previous custom entry shouldn't force retyping it from scratch.
    // A preset selection starts the custom row empty, same as a fresh pick.
    setCustomDraft(value && !matchedOption ? value : '');
    setEditingCustom(false);
    setSheetOpen(true);
  }

  function pickPreset(option: SelectOption) {
    onChange(option.value);
    setSheetOpen(false);
  }

  function startCustom() {
    setEditingCustom(true);
  }

  function confirmCustom() {
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setSheetOpen(false);
  }

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="500" color="$neutral900">
        {label}
      </Text>

      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$2"
        borderRadius="$control"
        borderColor={borderColor}
        borderWidth={1}
        backgroundColor="$neutral0"
        paddingHorizontal={12}
        paddingVertical={10}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${displayText ?? 'non défini'}`}
      >
        {IconComponent && <IconComponent size={18} color={tc.neutral500} />}
        <Text fontSize={15.5} color={displayText ? '$neutral900' : '$neutral500'} flex={1}>
          {displayText ?? placeholder}
        </Text>
        <CaretDownIcon size={16} color={tc.neutral500} />
      </XStack>

      {error && (
        <Text fontSize={13} color="$danger">
          {error}
        </Text>
      )}

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={label}
        scroll={!editingCustom}
      >
        {editingCustom ? (
          <YStack gap="$4">
            <FormField
              label={otherLabel}
              value={customDraft}
              onChangeText={setCustomDraft}
              autoFocus
              placeholder="Précisez…"
            />
            <Button onPress={confirmCustom} disabled={!customDraft.trim()}>
              Terminé
            </Button>
          </YStack>
        ) : (
          <YStack gap="$3">
            {showSearch && (
              <XStack
                alignItems="center"
                gap="$2"
                backgroundColor="$neutral100"
                borderRadius="$control"
                paddingHorizontal={12}
                borderWidth={1}
                borderColor="$neutral200"
              >
                <MagnifyingGlassIcon size={16} color={tc.neutral500} />
                <Input
                  flex={1}
                  unstyled
                  placeholder="Rechercher…"
                  placeholderTextColor={tc.neutral500}
                  value={query}
                  onChangeText={setQuery}
                  paddingVertical={10}
                  fontSize={14.5}
                />
              </XStack>
            )}

            <YStack gap="$1">
              {filteredOptions.map((option) => {
                const active = option.value === value;
                return (
                  <XStack
                    key={option.value}
                    alignItems="center"
                    justifyContent="space-between"
                    paddingVertical={10}
                    paddingHorizontal={8}
                    borderRadius="$control"
                    backgroundColor={active ? '$accent100' : 'transparent'}
                    onPress={() => pickPreset(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text fontSize={15} color="$neutral900">
                      {option.label}
                    </Text>
                    {active && <CheckIcon size={17} weight="bold" color={tc.accent600} />}
                  </XStack>
                );
              })}

              {filteredOptions.length === 0 && (
                <Text fontSize={13.5} color="$neutral500" paddingVertical={8}>
                  Aucun résultat pour « {query} ».
                </Text>
              )}
            </YStack>

            <XStack
              alignItems="center"
              justifyContent="space-between"
              paddingVertical={10}
              paddingHorizontal={8}
              borderRadius="$control"
              borderTopWidth={1}
              borderTopColor="$neutral100"
              marginTop="$1"
              onPress={startCustom}
              accessibilityRole="button"
            >
              <Text fontSize={15} color="$accent600" fontWeight="500">
                {otherLabel}
              </Text>
            </XStack>
          </YStack>
        )}
      </Sheet>
    </YStack>
  );
}

// Exported so screens don't have to reference the internal sentinel — kept
// even though nothing in this phase's call sites needs it, since a future
// screen distinguishing "explicitly chose Autre with an empty draft" from
// "never opened the picker" may want it. Not otherwise used by this file's
// own logic (confirmCustom already guards on a non-empty trimmed draft).
export const SELECT_OTHER_SENTINEL = OTHER_VALUE;

import { color } from '@dala/design-tokens';
import { FunnelIcon, MagnifyingGlassIcon, XCircleIcon } from 'phosphor-react-native';
import { TextInput, View as RNView } from 'react-native';
import { View, XStack } from 'tamagui';

import { ICON_BUTTON_SIZE, IconButton } from './IconButton';

/**
 * apps/mobile/src/components/ui/SearchFilterBar.tsx
 *
 * UI/UX pass (Chantiers audit) — replaces the hand-rolled search+filter
 * row in `projects.tsx` (the two controls that don't share a height, per
 * IconButton.tsx's own comment). Both the search field and the filter
 * `IconButton` are pinned to `ICON_BUTTON_SIZE` (44) here, so they can
 * never drift out of alignment again — this is the actual fix, not just
 * a visual patch on this one screen.
 *
 * Any other screen that grows a search+filter row (materials, team,
 * vehicles) should use this component rather than re-hand-rolling the
 * pattern a third time.
 */
interface SearchFilterBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onFilterPress?: () => void;
  filterActive?: boolean;
  filterAccessibilityLabel?: string;
  filterAnchorRef?: React.RefObject<RNView | null>;
}

export function SearchFilterBar({
  value,
  onChangeText,
  placeholder,
  onFilterPress,
  filterActive = false,
  filterAccessibilityLabel = 'Filtrer',
  filterAnchorRef,
}: SearchFilterBarProps) {
  return (
    <XStack gap="$2" alignItems="center">
      <XStack
        flex={1}
        height={ICON_BUTTON_SIZE}
        backgroundColor="$neutral0"
        borderRadius="$control"
        paddingHorizontal={12}
        alignItems="center"
        gap="$2"
        borderWidth={1}
        borderColor="$neutral300"
      >
        <MagnifyingGlassIcon size={16} color={color.neutral[500]} />
        <TextInput
          accessibilityLabel="Text input field"
          placeholder={placeholder}
          placeholderTextColor={color.neutral[500]}
          value={value}
          onChangeText={onChangeText}
          style={{ flex: 1, fontSize: 14, color: color.neutral[900], height: '100%' }}
        />
        {value.length > 0 && (
          <View
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel="Effacer"
          >
            <XCircleIcon size={16} weight="fill" color={color.neutral[300]} />
          </View>
        )}
      </XStack>

      {onFilterPress && (
        <View ref={filterAnchorRef} collapsable={false}>
          <IconButton
            icon={FunnelIcon}
            onPress={onFilterPress}
            accessibilityLabel={filterAccessibilityLabel}
            active={filterActive}
            showDot={filterActive}
          />
        </View>
      )}
    </XStack>
  );
}

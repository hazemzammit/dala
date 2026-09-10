import { Modal, Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { Icon3D } from '@/components/ui/Icon3D';
import type { Icon3DName } from '@/components/ui/icons3d';

/**
 * apps/mobile/src/components/ui/ConfirmDialog.tsx
 *
 * Phase 24 — themed replacement for `Alert.alert` on DESTRUCTIVE actions
 * only ("Supprimer ce véhicule ?", "Quitter l'organisation ?", disable 2FA,
 * etc.). Unlike Toast, this is deliberately still a blocking modal — an
 * irreversible action should interrupt, it just shouldn't look like a bare
 * OS dialog that clashes with the rest of the app's teal/rounded language.
 *
 * Same Modal-based structure as Sheet.tsx (not Tamagui's own Sheet) for the
 * same "fewer moving parts" reasoning already established there.
 *
 * IMPROVEMENT-PLAN Part A — optional `icon` prop added (large-icon variant,
 * per the guide's own description of this exact call site). Didn't exist
 * before this; every caller today omits it and renders exactly as before —
 * this is additive, not a behavior change for existing call sites.
 */
interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Large (64px) Icon3D shown above the title — omit for the plain
   * text-only dialog every existing call site already uses. */
  icon?: Icon3DName;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = true,
  loading = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        accessibilityRole="button"
        style={{
          flex: 1,
          backgroundColor: 'rgba(17,19,24,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
        onPress={onCancel}
      >
        {/* Swallow taps on the card itself so they don't bubble to the
            backdrop Pressable and dismiss unintentionally. */}
        <Pressable
          accessibilityRole="button"
          onPress={(e) => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 380 }}
        >
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$sheet"
            padding="$5"
            gap="$3"
            shadowColor="#000"
            shadowOpacity={0.18}
            shadowRadius={20}
            shadowOffset={{ width: 0, height: 8 }}
          >
            {icon && (
              <YStack alignItems="center" marginBottom="$1">
                <Icon3D name={icon} />
              </YStack>
            )}
            <Text fontFamily="$display" fontSize={18} fontWeight="600" textAlign="center">
              {title}
            </Text>
            {description && (
              <Text fontSize={14.5} color="$neutral500" textAlign="center" lineHeight={20}>
                {description}
              </Text>
            )}
            <YStack gap="$2" marginTop="$2">
              <Button
                variant={destructive ? 'primary' : 'primary'}
                backgroundColor={destructive ? '$danger' : '$accent600'}
                onPress={onConfirm}
                loading={loading}
              >
                {confirmLabel}
              </Button>
              <Button variant="text" onPress={onCancel} disabled={loading}>
                {cancelLabel}
              </Button>
            </YStack>
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

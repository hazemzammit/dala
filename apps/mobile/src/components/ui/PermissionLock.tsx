import { color } from '@dala/design-tokens';
import { LockIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Text, View, XStack } from 'tamagui';

import { Button } from './Button';

/**
 * apps/mobile/src/components/ui/PermissionLock.tsx
 *
 * Doc 05 §4 / §1.7b / §1.7q — Phase 20. Extracted verbatim from the pattern
 * already in production use at `organization-settings.tsx` (matricule
 * fiscal, registre de commerce, RIB — three fields, each hand-rolling the
 * same `{!isOwner && <LockIcon .../>}` condition next to a label). This
 * component is that pattern made reusable, not a new design:
 *
 *   Before:
 *     <XStack alignItems="center" gap="$1.5">
 *       <Text ...>Matricule fiscal</Text>
 *       {!isOwner && <LockIcon size={13} color={color.neutral[500]} />}
 *     </XStack>
 *
 *   After:
 *     <PermissionLock locked={!isOwner} reason="Seul le propriétaire peut modifier ce champ.">
 *       <Text ...>Matricule fiscal</Text>
 *     </PermissionLock>
 *
 * `unlocked` is a true no-op: `children` renders exactly as given, no
 * wrapping XStack, no extra layout — so wrapping an already-correct
 * unlocked field costs nothing.
 *
 * §1.7n (accessibility): the lock icon alone is never announced as
 * meaningful to a screen reader without a label — `reason`, when given,
 * becomes the icon's `accessibilityLabel`. Falls back to a generic
 * "Modification restreinte" so this is never silently unlabeled if a call
 * site forgets to pass one.
 *
 * §1.7q (recovery guidance, optional): `actionLabel`/`onAction` render a
 * small inline text-button after the reason — "Demander l'accès" /
 * "Contacter le responsable" style. Omit both for the plain
 * disabled/read-only-with-explanation tier, which is the default and
 * doesn't require a recovery action. Never use this on the plain-disabled
 * `feature-flags` exception (Doc 05 §1.7b/§1.7q) — that screen stays as-is.
 */
interface PermissionLockProps {
  /** When false, renders `children` untouched — a true no-op wrapper. */
  locked: boolean;
  /** Accessible + visible reason shown next to the lock icon. */
  reason?: string;
  /** Optional §1.7q recovery action, e.g. "Demander l'accès". */
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}

export function PermissionLock({
  locked,
  reason,
  actionLabel,
  onAction,
  children,
}: PermissionLockProps) {
  if (!locked) return <>{children}</>;

  return (
    <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
      {children}
      {/* phosphor-react-native icons don't accept accessibilityLabel
          directly (confirmed via typecheck) — same wrapping pattern
          IconButton.tsx already uses for its own icon. */}
      <View accessibilityLabel={reason ?? 'Modification restreinte'} accessibilityRole="image">
        <LockIcon size={13} color={color.neutral[500]} />
      </View>
      {reason && (
        <Text fontSize={12} color="$neutral500" flexShrink={1}>
          {reason}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button variant="chip" fullWidth={false} onPress={onAction}>
          {actionLabel}
        </Button>
      )}
    </XStack>
  );
}

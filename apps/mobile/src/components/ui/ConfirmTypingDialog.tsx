import { useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';

/**
 * apps/mobile/src/components/ui/ConfirmTypingDialog.tsx
 *
 * Doc 05 §1.7c (Tier 3) — mobile's equivalent of Admin's
 * `ConfirmTypingDialog` (now in packages/ui-web after 19B), built for
 * Phase 19C's Advances Approve/Reject/Mark-as-Paid actions.
 *
 * JUDGMENT CALL, made explicitly (per 19C's instructions, not assumed):
 * this is a genuinely new mobile component, not a port of Admin's file —
 * `materials.tsx`'s existing mandatory-reason reject flow (a `FormField`
 * + "Confirmer le refus" button in a Sheet) was considered as mobile's
 * Tier 3 pattern and rejected for that role. Reasoning:
 *
 * - §1.7c's own table is explicit that Tier 3 is "ConfirmTypingDialog +
 *   mandatory reason" — TWO things, not one. materials.tsx's flow only
 *   has the reason half. A mandatory-reason field alone is real friction,
 *   but it doesn't defend against the specific failure mode typed
 *   confirmation exists for: a manager, fatigued after reviewing many
 *   requests in a row, mis-tapping approve/reject on the WRONG entity.
 *   Reading and typing that entity's own identifying detail is what
 *   catches that — a reason field doesn't, since a generic reason
 *   ("pas nécessaire") can be typed on autopilot without re-reading who
 *   it's for.
 * - Admin's version has the user type the org's NAME specifically (not a
 *   fixed generic word like "CONFIRMER") for exactly that reason — per
 *   §1.7f, the CONTRACT to preserve across platforms is "type the
 *   specific entity's identifying value," not the literal choice of
 *   which entity or a fixed placeholder word. This component carries
 *   that same contract over: for Advances, the value to type is the
 *   WORKER'S name — mobile's equivalent of "the specific thing you'd
 *   feel bad about getting wrong." A worker's first name is also
 *   meaningfully shorter to type correctly on a phone keyboard than an
 *   org's full legal name, which matters for a routine (if
 *   consequential) action a contractor may do many times a week from a
 *   job site — composition (what gets typed, how heavy the dialog looks)
 *   differs by platform; the contract (typed, per-instance, deliberate
 *   confirmation) doesn't.
 * - Composition otherwise follows `ConfirmDialog.tsx`'s existing Modal
 *   idiom (not a Sheet, not a web-style inline card) — same backdrop,
 *   same card shape — rather than introducing a third dialog pattern.
 *
 * REASON FIELD: added in Phase 19F, migration 0090 — `approve_advance`/
 * `mark_salary_cycle_paid` now take a real `p_reason` parameter, and
 * reject persists a real `manager_reason` column, all distinct from the
 * worker's own `advances.reason` column set at creation. `requireReason`
 * mirrors the shared web/admin ConfirmTypingDialog's (packages/ui-web)
 * same-named prop and the same 10-character minimum, so the "typed
 * confirmation, mandatory reason" Tier 3 contract is identical across
 * platforms even though the two components remain separate files (see
 * this component's own header above for why they don't share code).
 */
interface ConfirmTypingDialogProps {
  visible: boolean;
  title: string;
  description?: string;
  /** The exact value the person must type — e.g. the worker's name. */
  confirmValue: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Doc 05 §1.7c Tier 3 — when true, a mandatory reason textarea (10-char
   * minimum) is shown and must be filled before confirming. Default false
   * preserves every existing call site's current behavior unchanged. */
  requireReason?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmTypingDialog({
  visible,
  title,
  description,
  confirmValue,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  loading = false,
  requireReason = false,
  onConfirm,
  onCancel,
}: ConfirmTypingDialogProps) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const matches = typed.trim().length > 0 && typed.trim() === confirmValue.trim();
  const reasonOk = !requireReason || reason.trim().length >= 10;

  function handleCancel() {
    setTyped('');
    setReason('');
    onCancel();
  }

  function handleConfirm() {
    onConfirm(reason.trim());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable
        accessibilityRole="button"
        style={{
          flex: 1,
          backgroundColor: 'rgba(17,19,24,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
        onPress={handleCancel}
      >
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
            <Text fontFamily="$display" fontSize={18} fontWeight="600" textAlign="center">
              {title}
            </Text>
            {description && (
              <Text fontSize={14.5} color="$neutral500" textAlign="center" lineHeight={20}>
                {description}
              </Text>
            )}

            {requireReason && (
              <FormField
                label="Motif (10 caractères minimum)"
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={2}
              />
            )}

            <FormField
              label={`Tapez "${confirmValue}" pour confirmer`}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <YStack gap="$2" marginTop="$2">
              <Button
                backgroundColor={destructive ? '$danger' : '$accent600'}
                onPress={handleConfirm}
                loading={loading}
                disabled={!matches || !reasonOk}
              >
                {confirmLabel}
              </Button>
              <Button variant="text" onPress={handleCancel} disabled={loading}>
                {cancelLabel}
              </Button>
            </YStack>
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

import { Text, XStack, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/PasswordStrengthMeter.tsx
 *
 * Doc 05 §2.5 — 3-segment bar, Faible/Moyen/Fort, danger→warning→success,
 * never a blocking wall. Same scoring heuristic as the web version
 * (apps/web/src/components/ui/PasswordStrengthMeter.tsx) — keep both in
 * sync if the heuristic ever changes.
 */
function scorePassword(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

const LABELS = ['', 'Faible', 'Moyen', 'Fort'] as const;
const COLORS = ['$neutral100', '$danger', '$warning', '$success'] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = scorePassword(password);
  if (!password) return null;

  return (
    <YStack marginTop="$1.5" gap="$1">
      <XStack gap="$1.5">
        {[1, 2, 3].map((segment) => (
          <YStack
            key={segment}
            flex={1}
            height={4}
            borderRadius={999}
            backgroundColor={segment <= score ? COLORS[score] : '$neutral100'}
          />
        ))}
      </XStack>
      {score > 0 && (
        <Text fontSize={12} color="$neutral500">
          {LABELS[score]}
        </Text>
      )}
    </YStack>
  );
}

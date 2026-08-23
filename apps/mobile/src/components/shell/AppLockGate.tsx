import { LockKeyIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Text, View, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { authenticateWithBiometrics, getBiometricLockEnabled } from '@/lib/biometricLock';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/shell/AppLockGate.tsx
 *
 * Phase 12 (improvement-plan §6.6). Same "renders nothing normally,
 * mounted once at the root" shape as `AutoSync.tsx` — except this one DOES
 * render something (a full-screen overlay) in its locked state, which is
 * the entire point: it has to sit above `<Stack>` in z-order so it can
 * actually block interaction with whatever screen is underneath.
 * Deliberately `position: absolute` covering the full root (unlike
 * `OfflineBanner`, which `_layout.tsx`'s own comment explains is
 * deliberately NOT absolute) — a lock screen that only pushed content
 * down instead of covering it would leave the real screen's contents
 * (financial figures, worker PII) visible and interactive underneath a
 * banner, defeating the purpose.
 *
 * Re-locks on every background→active transition when the setting is on
 * — not on a timer/threshold (e.g. "only if backgrounded > 30s"). This is
 * a deliberate, disclosed simplification for a v1: the plan's own wording
 * calls this "optional," not spec'd to a specific grace period, and an
 * unconditional re-lock is the simpler, more conservative default — a
 * grace-period version is a straightforward follow-up if it proves
 * annoying in practice, flagged as such in PHASE_12_BRIEF.md rather than
 * guessed at here.
 *
 * Never locks when there is no active Supabase session — nothing behind
 * the welcome/login screens is sensitive, and prompting Face ID before
 * someone has even signed in would be actively confusing, not protective.
 */
export function AppLockGate() {
  const [locked, setLocked] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    void refreshEnabledAndMaybeLock();

    const subscription = AppState.addEventListener('change', (nextState) => {
      void handleAppStateChange(appState.current, nextState);
      appState.current = nextState;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshEnabledAndMaybeLock() {
    const isEnabled = await getBiometricLockEnabled();
    setEnabled(isEnabled);
    if (isEnabled && (await hasActiveSession())) {
      setLocked(true);
    }
  }

  async function handleAppStateChange(previous: AppStateStatus, next: AppStateStatus) {
    if (previous.match(/inactive|background/) && next === 'active') {
      const isEnabled = await getBiometricLockEnabled();
      setEnabled(isEnabled);
      if (isEnabled && (await hasActiveSession())) {
        setLocked(true);
      }
    }
  }

  async function hasActiveSession(): Promise<boolean> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return !!session;
  }

  async function handleUnlock() {
    const success = await authenticateWithBiometrics();
    if (success) {
      setLocked(false);
    }
  }

  useEffect(() => {
    if (locked) {
      void handleUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  if (!enabled || !locked) return null;

  return <AppLockOverlay onUnlock={() => void handleUnlock()} />;
}

function AppLockOverlay({ onUnlock }: { onUnlock: () => void }) {
  const tc = useTokenColor();
  return (
    <View
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="$neutral25"
      zIndex={1000}
      alignItems="center"
      justifyContent="center"
    >
      <YStack alignItems="center" paddingHorizontal="$4">
        <View
          width={64}
          height={64}
          borderRadius={999}
          backgroundColor="$neutral100"
          alignItems="center"
          justifyContent="center"
        >
          <LockKeyIcon size={28} weight="fill" color={tc.accent600} />
        </View>
        <Text fontFamily="$display" fontSize={18} fontWeight="600" marginTop="$3">
          Dala est verrouillé
        </Text>
        <Text color="$neutral500" fontSize={14} marginTop="$1.5" textAlign="center" maxWidth={280}>
          Authentifiez-vous pour continuer.
        </Text>
        <View marginTop="$4">
          <Button fullWidth={false} onPress={onUnlock}>
            Déverrouiller
          </Button>
        </View>
      </YStack>
    </View>
  );
}

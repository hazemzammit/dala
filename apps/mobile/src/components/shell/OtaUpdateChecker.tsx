import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * apps/mobile/src/components/shell/OtaUpdateChecker.tsx
 *
 * Phase 12 (improvement-plan §6.4). DECISION, stated explicitly per the
 * plan's own instruction ("weigh it explicitly... state the decision and
 * reasoning"), not a silent default:
 *
 * ADOPTED. Reasoning:
 *   - Cost side, confirmed current via docs.expo.dev rather than assumed:
 *     `expo-updates` needs an EAS project linkage (`app.json`'s
 *     `extra.eas.projectId` — already present in this repo before this
 *     phase, so that specific cost is already paid), an `updates.url`
 *     pointing at that project, a `runtimeVersion` policy, and per-profile
 *     channels in `eas.json` (this phase's own, since none existed
 *     before). All added this phase.
 *   - The one cost that CANNOT be paid from inside this sandbox and
 *     cannot be worked around by more careful config: a JS-only OTA
 *     update can only reach a native binary that was ITSELF built with
 *     `expo-updates` already linked in. Today's already-shipped/already-
 *     installed builds (if any exist outside this repo's own dev/preview
 *     builds) have no `expo-updates` native module at all — the very
 *     first OTA update can only start applying after the NEXT native
 *     build (the next `eas build`) ships with this dependency compiled
 *     in. This is a one-time, unavoidable bootstrap cost, not a bug in
 *     this phase's work — flagged plainly in PHASE_12_BRIEF.md rather
 *     than left implicit.
 *   - Benefit side: a pilot-stage product (per this repo's own docs, a
 *     single real pilot user's construction business) iterating on
 *     French-language copy, validation messages, and small UI fixes
 *     benefits disproportionately from shipping a one-line copy fix in
 *     minutes via `eas update` instead of a full store review cycle
 *     (which `docs/APP_STORE_READINESS.md`, this same phase, notes can
 *     take days on iOS). That asymmetry — low implementation cost now
 *     paid once, recurring iteration-speed benefit for exactly the phase
 *     this product is in — is why this tips to adopt rather than defer.
 *
 * Checks ONLY on foreground (same trigger shape as `AutoSync.tsx`, not a
 * new polling mechanism) and ONLY in a real (non-Expo-Go, non-`__DEV__`)
 * build — `Updates.isEnabled` is false in both of those cases by the
 * SDK's own design, so this guard is a fast-path, not strictly required,
 * but is kept explicit for readability. On finding an update, downloads
 * and reloads immediately rather than deferring to next cold start —
 * deliberately the simpler of the two standard patterns for a v1; a
 * "reload silently vs. prompt the user" decision is exactly the kind of
 * UX nuance worth revisiting with real pilot feedback rather than
 * guessing at here.
 */
export function OtaUpdateChecker() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    async function checkAndApply() {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (err) {
        // Fail silently to the currently-running bundle — an OTA check
        // failure (offline, server hiccup) should never block or crash
        // the app that's already running.
        // eslint-disable-next-line no-console
        console.warn('[ota] update check failed', err);
      }
    }

    void checkAndApply();

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground =
        (appStateRef.current === 'background' || appStateRef.current === 'inactive') &&
        nextState === 'active';
      appStateRef.current = nextState;
      if (cameToForeground) {
        void checkAndApply();
      }
    });

    return () => subscription.remove();
  }, []);

  return null;
}

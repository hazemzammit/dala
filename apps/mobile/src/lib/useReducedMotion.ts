import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * apps/mobile/src/lib/useReducedMotion.ts
 *
 * Doc 05 §1.4b (new, v5.2) — "All non-essential motion must respect the
 * OS/browser reduced-motion preference... Reduced motion replaces animated
 * feedback with an accessible static equivalent — it never simply removes
 * the feedback."
 *
 * Scope (Phase 19A): wired into the only motion tokens actually consumed
 * anywhere in the app today — `press` (Button, IconButton, FAB) and
 * `crossfade` (the worker state-machine button's `AnimatePresence` in
 * `(worker)/home.tsx`). `screenTransition` and a chart-entrance animation
 * are named in §1.4b's table but aren't wired to anything in the codebase
 * yet (confirmed via grep) — nothing exists there to make reduced-motion-
 * aware, so neither is touched here.
 *
 * Reads the OS-level "Reduce Motion" accessibility setting and stays in
 * sync if the person toggles it while the app is open (e.g. via Settings
 * without a restart) — `isReduceMotionEnabled()` alone would only capture
 * the value at mount.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReducedMotion(enabled);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

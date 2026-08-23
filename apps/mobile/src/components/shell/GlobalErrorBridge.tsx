import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';

import { useToast } from '@/components/ui/Toast';
import { getFatalErrorSnapshot, subscribeFatalError } from '@/lib/errorStatus';

/**
 * apps/mobile/src/components/shell/GlobalErrorBridge.tsx
 *
 * Phase 12 (improvement-plan §10.3). Renders nothing — same "renders
 * nothing, subscribes to something outside React, reacts via an effect"
 * pattern as `AutoSync.tsx`/`NotificationRouter.tsx`, applied here to
 * `errorStatus.ts`'s external store instead of AppState/notification
 * events.
 *
 * Has to be a component mounted INSIDE `<ToastProvider>` (see
 * `_layout.tsx`) rather than a plain module-level subscription, since
 * `useToast()` — like every context hook — only works within the
 * provider's subtree. `errorStatus.ts` itself has no dependency on React
 * or Toast at all, by design, so `sentry.ts`'s `beforeSend` hook (which
 * runs long before any component tree exists, during Sentry.init at
 * `_layout.tsx` module scope) can call `reportFatalError()` unconditionally
 * without needing a Toast context reference of its own.
 */
export function GlobalErrorBridge() {
  const toast = useToast();
  const fatalError = useSyncExternalStore(subscribeFatalError, getFatalErrorSnapshot);

  useEffect(() => {
    if (fatalError) {
      toast.error(fatalError.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fatalError?.id]);

  return null;
}

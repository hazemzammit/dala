import * as Haptics from 'expo-haptics';

/**
 * apps/mobile/src/lib/haptics.ts
 *
 * A thin, semantic wrapper over expo-haptics rather than calling
 * `Haptics.*` directly at call sites. Two reasons:
 *   1. It keeps the "only at meaningful moments" rule enforceable — every
 *      call site reads as `haptics.confirm()` / `haptics.error()`, not a
 *      raw impact style that has to be re-justified every time.
 *   2. It's a single place to swap the underlying feel later without
 *      touching every screen.
 *
 * Deliberately NOT wired into generic navigation taps, tab switches, or
 * FAB opens — only:
 *   - haptics.confirm(): worker departure/arrival, dispatch assignment
 *     success, pointage save success — a light impact, "that landed."
 *   - haptics.error(): form validation failures, save/insert failures —
 *     the notification-style error haptic, distinct from a confirm so the
 *     two are never confused with eyes off the screen.
 */
export const haptics = {
  confirm() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  error() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
};

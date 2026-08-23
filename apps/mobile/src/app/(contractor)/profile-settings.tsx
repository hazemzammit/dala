import { ProfileScreen } from '@/components/profile/ProfileScreen';

/**
 * apps/mobile/src/app/(contractor)/profile-settings.tsx
 *
 * IMPROVEMENT-PLAN PHASE 10 — §4.1 step 3 resolution. This screen's entire
 * previous implementation (name/phone/email/avatar editing) has moved into
 * the shared `components/profile/ProfileScreen.tsx`, which this route now
 * renders with `role="contractor"`. Nothing in this route's own behavior
 * changed for an owner/manager/viewer session — same fields, same RPCs,
 * same phone/email re-verification flow — the move is structural only, so
 * the same shape can also serve `(worker)/profile.tsx` (new this phase)
 * without a second, drifting copy of the same form. See ProfileScreen.tsx's
 * own header comment for the full reasoning and the role-conditional
 * pieces this unification disclosed rather than silently varied.
 */
export default function ProfileSettingsScreen() {
  return <ProfileScreen role="contractor" />;
}

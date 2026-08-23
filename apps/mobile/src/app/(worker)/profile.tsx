import { ProfileScreen } from '@/components/profile/ProfileScreen';

/**
 * apps/mobile/src/app/(worker)/profile.tsx
 *
 * NEW this phase — IMPROVEMENT-PLAN PHASE 10, §4.1 step 3 resolution.
 * Replaces `(worker)/settings.tsx`'s previous "Profil" row, which only
 * opened a thin Sheet offering avatar-upload and nothing else (Phase 3's
 * own explicit, disclosed scope boundary — "out of scope for this phase
 * per the plan's own Step 2"). `settings.tsx`'s "Profil" row now pushes to
 * this route instead of opening that Sheet, matching exactly how the
 * contractor's "Profil" row has always pushed to `/profile-settings`
 * rather than opening a Sheet — see that route and
 * `components/profile/ProfileScreen.tsx` for the shared implementation
 * and the role-conditional pieces disclosed there (a worker session gets
 * a read-only trade/job-title/hire-date row and non-tappable phone/email
 * rows, unlike a contractor session — unchanged scope boundary from
 * Phase 3, carried forward, not reopened).
 */
export default function WorkerProfileScreen() {
  return <ProfileScreen role="worker" />;
}

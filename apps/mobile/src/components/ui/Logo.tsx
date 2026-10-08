import { Image } from 'react-native';

import logo from '@/assets/brand/logo.png';

/**
 * apps/mobile/src/components/ui/Logo.tsx
 *
 * The Dala wordmark lockup, as a component — same "every screen goes through
 * one component rather than importing the asset itself" reasoning as
 * Illustration.tsx and Icon3D.tsx, applied to the one brand asset instead of
 * artwork. Added because the logo was MISSING from every app screen until
 * this pass: `grep -r "logo" apps/mobile/src` turned up nothing, and
 * `src/assets` held only `icons-3d/` and `illustrations/`, even though Doc
 * 03 §3.3/§3.4 list it as the first element of Sign Up and Login
 * respectively. One component means the two auth screens can't drift apart
 * on its size, and a future third call site (web-parity parity aside — web
 * has its own copy at apps/web/assets/logo.png) can't pick a different
 * ratio by hand.
 *
 * The asset is a byte-for-byte copy of `apps/web/assets/logo.png`, which
 * apps/web's login page renders via next/image at `h-9` (36px tall). 44px
 * is the mobile default — slightly larger for a shorter viewing distance —
 * and the width always follows from the source's own 605×256 ratio rather
 * than being set independently, so the lockup can never be stretched.
 */
const SOURCE_ASPECT_RATIO = 605 / 256;
const DEFAULT_HEIGHT = 44;

interface LogoProps {
  /** Override only when a specific layout needs it (e.g. a compact header). */
  height?: number;
}

export function Logo({ height = DEFAULT_HEIGHT }: LogoProps) {
  return (
    <Image
      source={logo}
      style={{ width: Math.round(height * SOURCE_ASPECT_RATIO), height }}
      resizeMode="contain"
      accessible
      accessibilityLabel="Dala"
    />
  );
}

/**
 * apps/mobile/src/types/png.d.ts
 *
 * IMPROVEMENT-PLAN Part A. Nothing in this repo imported a .png as a
 * module before icons3d.ts (confirmed — it's the only file matching
 * `from '.*\.png'` anywhere in apps/mobile). `expo/tsconfig.base` does
 * NOT declare `*.png` itself (verified against Expo's own tsconfig —
 * it only sets compiler flags, no ambient module types); every real Expo
 * project that imports PNGs as modules adds this declaration itself, same
 * as svg.d.ts already does for `*.svg` in this same folder. Metro/Expo's
 * bundler already treats .png as a static asset at runtime regardless —
 * this only fixes TypeScript's `Cannot find module` error at build time.
 */
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const value: ImageSourcePropType;
  export default value;
}

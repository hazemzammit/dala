import { color as designColor, motion as motionTokens } from '@dala/design-tokens';
import { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

/**
 * apps/mobile/src/lib/motion.ts
 *
 * `motion.ts` constants already exist in `@dala/design-tokens`
 * (screenTransitionMs, microInteractionMs, dragLiftScale,
 * dragRejectReturnMs) but nothing in the app consumed them as actual
 * Reanimated config — every one of the ~22 existing Reanimated call sites
 * inlined its own spring/timing numbers. This file is the single place
 * screens import a named animation preset from, mirroring the token
 * file's own intent ("named token, not an inline spring value" — Doc 05
 * §5 checklist item).
 */

export const SPRING_CONFIG = {
  damping: 18,
  stiffness: 220,
  mass: 0.9,
};

export const PRESS_SPRING_CONFIG = {
  damping: 20,
  stiffness: 300,
};

/** Fade a list item in on mount, staggered by its index — used for the
 * "content just loaded" moment (Team roster, Journal entries) so a list
 * doesn't just pop in all at once after a skeleton. */
export function fadeInStagger(index: number, baseDelayMs = 40) {
  return FadeIn.duration(motionTokens.screenTransitionMs).delay(index * baseDelayMs);
}

/** Collapse-and-fade a card out — used when a pending item (advance
 * approval, invitation) resolves and should leave the list rather than
 * just re-render in place. */
export const collapseOut = FadeOut.duration(motionTokens.microInteractionMs * 2);

/** Smooth re-flow of siblings when a list shrinks/grows — pair with
 * `collapseOut`/`fadeInStagger` on the same list so remaining cards slide
 * into place instead of jumping. */
export const listReflow = LinearTransition.springify().damping(18).stiffness(220);

export const accentColor = designColor.accent[600];
export const successColor = designColor.status.success;
export const dangerColor = designColor.status.danger;

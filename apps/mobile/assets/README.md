# =============================================================================
# Dala — mobile app icon / splash source assets
# =============================================================================
# These are consumed by `expo prebuild` (app.json's icon / splash /
# android.adaptiveIcon.foregroundImage) — they are NOT imported by app code.
# The logo the SCREENS render is src/assets/brand/logo.png, via
# src/components/ui/Logo.tsx.
#
# icon.png (1080x1080, opaque white background)
#   Store / legacy launcher icon: the full lockup (mark + "dala" wordmark +
#   slogan), full-bleed. Kept opaque deliberately — a launcher icon may not
#   have transparency.
#
# adaptive-icon.png (1080x1080, transparent, mark ONLY, centred at ~57%)
#   Android's adaptive icon foreground. It used to be a byte-identical copy
#   of icon.png, which meant the full lockup — including the wordmark and the
#   slogan — was drawn into a canvas whose outer ~34% the launcher mask
#   crops, so "dala / La base de tout chantier." was cut off on every
#   device. The mark alone, sized inside the 66% safe zone, is what the
#   format actually expects.
#
# splash.png (1080x1080, transparent, lockup centred)
#   Native splash artwork. Transparent rather than white so app.json's
#   `splash.backgroundColor` (#FAFAFA) is what shows around it — the previous
#   version baked in a pure-white square, which read as a visible panel
#   against the #FAFAFA background.
#
# Regenerate after editing any of them:
#   npx expo prebuild -p android   (then `npx expo run:android` to rebuild)
# =============================================================================

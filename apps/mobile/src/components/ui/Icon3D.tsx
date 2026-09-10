import { Image } from 'react-native';
import { View } from 'tamagui';

import { icons3d, SCENE_ICONS, type Icon3DName } from './icons3d';
import {
  icons3dConstruction,
  SCENE_ICONS_CONSTRUCTION,
  type Icon3DConstructionName,
} from './icons3d-construction';

/**
 * apps/mobile/src/components/ui/Icon3D.tsx
 *
 * IMPROVEMENT-PLAN Part A foundation. Sibling to Illustration.tsx (same
 * "every screen goes through one component" reasoning), but for the
 * Thiings-style 3D-render PNG icon set rather than unDraw SVGs — hence
 * Image, not an SVG component, and no aspect-ratio letterboxing (every
 * source PNG here is a uniform 128×128 RGBA square, unlike unDraw's
 * ~1.6:1 SVGs).
 *
 * Sizing auto-selects between two tiers based on what the source art
 * actually depicts, rather than leaving each call site to guess a number:
 * - glyph tier (64px default) — a single rendered object (a padlock, a
 *   wallet, a badge). Reads fine small; this is nearly everything in the
 *   set.
 *   scene tier (120px default) — a small multi-element tableau (several
 *   distinct objects composed together: a map with route + pins, a
 *   flowchart with connected nodes, several people). These lose their
 *   detail and read as noise below ~100px, so they default larger.
 * Membership in SCENE_ICONS/SCENE_ICONS_CONSTRUCTION was decided by
 * actually opening every delivered PNG and judging composition, not from
 * filenames — see icons3d.ts / icons3d-construction.ts for the resulting
 * lists and per-icon reasoning.
 *
 * A call site can still override with an explicit `size` when a specific
 * layout needs it; the tier only sets the default.
 *
 * IMPROVEMENT-PLAN Part B — accepts names from either registry (generic
 * UI/status icons or the construction-domain set) through one component,
 * rather than a second `Icon3DConstruction` duplicate: the two PNG sets
 * share Thiings' rendering language and the exact same 128×128 RGBA shape
 * and sizing rules, so the only real difference is which lookup table a
 * name resolves against — not worth a second component for.
 */
interface Icon3DProps {
  name: Icon3DName | Icon3DConstructionName;
  size?: number;
}

export function Icon3D({ name, size }: Icon3DProps) {
  const source =
    name in icons3d
      ? icons3d[name as Icon3DName]
      : icons3dConstruction[name as Icon3DConstructionName];
  const isScene =
    SCENE_ICONS.has(name as Icon3DName) ||
    SCENE_ICONS_CONSTRUCTION.has(name as Icon3DConstructionName);
  const resolvedSize = size ?? (isScene ? 120 : 64);
  return (
    <View width={resolvedSize} height={resolvedSize} alignItems="center" justifyContent="center">
      <Image
        source={source}
        style={{ width: resolvedSize, height: resolvedSize }}
        resizeMode="contain"
      />
    </View>
  );
}

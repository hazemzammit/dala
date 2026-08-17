import { Image, Text, View, XStack } from 'tamagui';

import { toRgba, useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Avatar.tsx
 *
 * Doc 05 §4 — worker chips, project membership, team lists. Web
 * equivalent: apps/web/src/components/ui/Avatar.tsx — same palette/initials
 * logic, kept in sync deliberately (same hash function) so the same
 * person's avatar color matches on both platforms.
 *
 * Dark-mode pass: the palette used to be a module-level constant built
 * from `color.accent[...]`/`color.status.*` read directly, plus two
 * hand-picked light pastel hex literals ('#FEF3D8', '#DCF3E6') matching no
 * token at all. A module-level constant can't call `useTokenColor()`, so
 * the palette is now built inside `Avatar` itself (the one place that IS
 * a component) from theme-resolved values, with the two literal pastels
 * replaced by the same `toRgba` tint approach used everywhere else in this
 * pass. `paletteFor`'s hash function is UNCHANGED — it's what keeps a
 * given name mapped to the same palette INDEX consistently (and matching
 * the web twin's own hash), independent of what each theme resolves that
 * index's colors to.
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function paletteIndexFor(name: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % length;
}

interface AvatarProps {
  name: string;
  imageUrl?: string;
  size?: number;
  overlap?: boolean;
}

export function Avatar({ name, imageUrl, size = 32, overlap = false }: AvatarProps) {
  const tc = useTokenColor();
  const style = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2,
    borderColor: tc.neutral0,
    marginStart: overlap ? -size * 0.3 : 0,
  };

  if (imageUrl) {
    return <Image src={imageUrl} {...style} />;
  }

  const palette = [
    { bg: tc.accent100, fg: tc.accent700 },
    // Judgment call, not visually verified: the original two pastel
    // literals ('#FEF3D8'/'#DCF3E6') were solid, opaque "avatar chip"
    // colors designed to sit on a white card — a straight `toRgba` alpha
    // tint (the pattern used for badges/toasts elsewhere in this pass) at
    // badge-strength alpha (~0.12) would read as a barely-visible smudge
    // on a near-black dark-mode card, since it's blending toward
    // transparent rather than toward a solid pastel. Used a higher alpha
    // (0.22) here specifically so the chip stays visually "a colored
    // circle" rather than "a tint" on either background — this is a
    // reasonable-effort choice given no way to render and compare the
    // actual result here, not a measured/confirmed-correct value.
    { bg: toRgba(tc.warning, 0.22), fg: tc.warning },
    { bg: toRgba(tc.success, 0.22), fg: tc.success },
    { bg: tc.neutral200, fg: tc.neutral900 },
  ];
  const { bg, fg } = palette[paletteIndexFor(name, palette.length)]!;

  return (
    <View {...style} backgroundColor={bg} alignItems="center" justifyContent="center">
      <Text fontSize={size * 0.4} fontWeight="600" color={fg}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: { name: string; imageUrl?: string }[];
  max?: number;
  size?: number;
}) {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;

  return (
    <XStack alignItems="center">
      {visible.map((person, i) => (
        <Avatar key={`${person.name}-${i}`} {...person} size={size} overlap={i > 0} />
      ))}
      {overflow > 0 && (
        <View
          width={size}
          height={size}
          borderRadius={size / 2}
          borderWidth={2}
          borderColor="$neutral0"
          backgroundColor="$neutral100"
          marginStart={-size * 0.3}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={size * 0.32} fontWeight="600" color="$neutral500">
            +{overflow}
          </Text>
        </View>
      )}
    </XStack>
  );
}

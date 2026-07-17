import { color } from '@dala/design-tokens';
import { Image, Text, View, XStack } from 'tamagui';


/**
 * apps/mobile/src/components/ui/Avatar.tsx
 *
 * Doc 05 §4 — worker chips, project membership, team lists. Web
 * equivalent: apps/web/src/components/ui/Avatar.tsx — same palette/initials
 * logic, kept in sync deliberately (same hash function) so the same
 * person's avatar color matches on both platforms.
 */
const PALETTE = [
  { bg: color.accent[100], fg: color.accent[700] },
  { bg: '#FEF3D8', fg: color.status.warning },
  { bg: '#DCF3E6', fg: color.status.success },
  { bg: color.neutral[200], fg: color.neutral[900] },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

interface AvatarProps {
  name: string;
  imageUrl?: string;
  size?: number;
  overlap?: boolean;
}

export function Avatar({ name, imageUrl, size = 32, overlap = false }: AvatarProps) {
  const style = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2,
    borderColor: color.neutral[0],
    marginStart: overlap ? -size * 0.3 : 0,
  };

  if (imageUrl) {
    return <Image src={imageUrl} {...style} />;
  }

  const palette = paletteFor(name);
  return (
    <View {...style} backgroundColor={palette.bg} alignItems="center" justifyContent="center">
      <Text fontSize={size * 0.4} fontWeight="600" color={palette.fg}>
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

/**
 * apps/web/src/components/ui/Avatar.tsx
 *
 * Doc 05 §4 — "Avatar / AvatarStack: 1–N overlapping circles + '+N more'.
 * Used for worker chips, project membership, team lists."
 */
interface AvatarProps {
  name: string;
  imageUrl?: string;
  size?: number;
  className?: string;
}

const PALETTE = [
  'bg-accent-100 text-accent-700',
  'bg-warning/15 text-warning',
  'bg-success/15 text-success',
  'bg-neutral-200 text-neutral-900',
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function paletteFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

export function Avatar({ name, imageUrl, size = 32, className = '' }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.4 };

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        style={style}
        className={`border-neutral-0 rounded-full border-2 object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={style}
      className={`border-neutral-0 flex items-center justify-center rounded-full border-2 font-medium ${paletteFor(name)} ${className}`}
      title={name}
    >
      {initialsOf(name)}
    </div>
  );
}

interface AvatarStackProps {
  people: { name: string; imageUrl?: string }[];
  max?: number;
  size?: number;
}

export function AvatarStack({ people, max = 4, size = 28 }: AvatarStackProps) {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;

  return (
    <div className="flex items-center">
      {visible.map((person, i) => (
        <Avatar
          key={`${person.name}-${i}`}
          name={person.name}
          imageUrl={person.imageUrl}
          size={size}
          className={i > 0 ? '-ms-2' : ''}
        />
      ))}
      {overflow > 0 && (
        <div
          style={{ width: size, height: size, fontSize: size * 0.35 }}
          className="border-neutral-0 -ms-2 flex items-center justify-center rounded-full border-2 bg-neutral-100 font-medium text-neutral-500"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

/**
 * apps/admin/src/components/ui/Avatar.tsx — mirrors apps/web's exactly.
 * Doc 05 §4: 1–N overlapping circles + "+N more".
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

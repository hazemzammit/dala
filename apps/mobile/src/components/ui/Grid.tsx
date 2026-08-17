import { XStack, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/Grid.tsx
 *
 * Every list screen so far lays out cards in a single Y-stacked column by
 * hand. `Grid` is the reusable N-column wrapper Doc 05 §4's component
 * inventory implies but never got built — first use: Projects' list/grid
 * toggle (screens with many cards benefit from 2-up on a phone in landscape
 * or a larger device; 1-up stays the default on a normal portrait phone).
 *
 * Deliberately simple: takes pre-chunked children via `columns`, doesn't
 * try to do CSS-grid-style auto-flow/masonry — that's more machinery than
 * this app's card shapes (mostly uniform height) need.
 */
interface GridProps {
  children: React.ReactNode[];
  columns?: number;
  gap?: number;
}

export function Grid({ children, columns = 2, gap = 10 }: GridProps) {
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < children.length; i += columns) {
    rows.push(children.slice(i, i + columns));
  }

  return (
    <YStack gap={gap}>
      {rows.map((row, rowIndex) => (
        <XStack key={rowIndex} gap={gap}>
          {row.map((child, colIndex) => (
            <YStack key={colIndex} flex={1}>
              {child}
            </YStack>
          ))}
          {/* Pad the last row so a lone item doesn't stretch full-width. */}
          {row.length < columns &&
            Array.from({ length: columns - row.length }).map((_, i) => (
              <YStack key={`pad-${i}`} flex={1} />
            ))}
        </XStack>
      ))}
    </YStack>
  );
}

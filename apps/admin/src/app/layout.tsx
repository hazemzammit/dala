import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dala Admin',
  description: 'Platform Admin — internal only.',
};

/**
 * Doc 05 §3.6 — Platform Admin is deliberately a visually distinct app:
 * same design tokens (no invented second color/type system) but plainer,
 * denser, tables-first, no marketing-adjacent hero cards.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-neutral-25 text-neutral-900">{children}</body>
    </html>
  );
}

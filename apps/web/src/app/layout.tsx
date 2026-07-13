import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dala — La base de tout chantier.',
  description: 'Gestion de chantiers, dispatch, avances et matériaux pour le BTP tunisien.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // dir="ltr" for now — French ships first (Doc 00 §0.6). When the Arabic
  // locale ships, this becomes dynamic based on the active locale, and
  // logical-property CSS (already the convention, see design-tokens'
  // RTL_CONVENTION_NOTE) means the layout doesn't need a rewrite.
  return (
    <html lang="fr" dir="ltr">
      <body className="bg-neutral-25 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}

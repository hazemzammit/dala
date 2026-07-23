import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Tunisia Construction OS',
  description: 'Modern construction management software for Tunisian contractors.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // dir="ltr" for now — French ships first (Doc 00 §0.6). When the Arabic
  // locale ships, this becomes dynamic based on the active locale, and
  // logical-property CSS (already the convention, see design-tokens'
  // RTL_CONVENTION_NOTE) means the layout doesn't need a rewrite.
  return (
    <html lang="fr" dir="ltr">
      <body className={`${sora.variable} bg-neutral-25 text-neutral-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}

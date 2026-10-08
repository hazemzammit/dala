'use client';

import { AuthSplitPanel } from '@dala/ui-web';
import {
  BellIcon,
  BuildingsIcon,
  ClipboardTextIcon,
  GaugeIcon,
  ShieldCheckIcon,
  WalletIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';

import { LoginForm } from './LoginForm';

/**
 * Doc 04 §4.3.1 — Admin Login, step 1. Doc 05 §1.3 — auth screens use the
 * "raised" elevation tier (same as apps/web's auth screens).
 *
 * UI/UX pass: split-screen layout, same shape as apps/web's login screen,
 * so both apps read as one product family — but the right panel uses
 * `tone="admin"` (the dark end of the palette, per AuthSplitPanel's own
 * comment) and admin-specific copy/features rather than the contractor
 * feature set, since this is the internal console, not the customer app.
 */
export default function AdminLoginPage() {
  return (
    <main className="bg-neutral-0 flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <Image
            src="/logo-full.png"
            alt="Dala Admin"
            width={120}
            height={40}
            priority
            className="h-9 w-auto"
          />

          <h1 className="font-display mt-8 text-[26px] font-semibold leading-[1.25] text-neutral-900">
            Console d&apos;administration
          </h1>
          <p className="mt-3 text-sm text-neutral-500">Accès réservé à l&apos;équipe Dala.</p>

          <LoginForm />

          <p className="mt-10 flex items-center gap-1.5 text-xs text-neutral-400">
            <ShieldCheckIcon size={14} />
            Accès protégé par double authentification.
          </p>
        </div>
      </div>

      <AuthSplitPanel
        tone="admin"
        eyebrow="Console interne"
        title={
          <>
            Pilotez toute
            <br />
            la plateforme Dala.
          </>
        }
        features={[
          { icon: <BuildingsIcon size={18} />, label: 'Organisations & clients' },
          { icon: <WalletIcon size={18} />, label: 'Facturation & abonnements' },
          { icon: <GaugeIcon size={18} />, label: 'Supervision & santé' },
          { icon: <ClipboardTextIcon size={18} />, label: "Journal d'audit" },
          { icon: <ShieldCheckIcon size={18} />, label: 'Sécurité & accès' },
          { icon: <BellIcon size={18} />, label: 'Notifications' },
        ]}
      />
    </main>
  );
}

import { AppVersionsForm } from './AppVersionsForm';

/**
 * Doc 01 §1.8.2 — App version / forced-update, editable from Platform
 * Admin (admin remediation Tier 2.5). Grouped near Services Health in the
 * sidebar nav — same "operational lever" category, not user/org/billing
 * data management.
 */
export default function AppVersionsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">
        Versions de l&apos;application
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Version publiée et version minimale supportée par plateforme.
      </p>
      <div className="mt-6">
        <AppVersionsForm />
      </div>
    </div>
  );
}

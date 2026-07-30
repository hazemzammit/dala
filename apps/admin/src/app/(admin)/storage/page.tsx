import { StorageUsageTable } from './StorageUsageTable';

/**
 * Doc 06 §6.3 — Storage Monitor.
 *
 * Real per-org rollup, computed from storage.objects via
 * admin_storage_usage_by_org() (migration 0026) — see that migration's
 * header comment and the API route for why this isn't backed by an
 * `organizations.storage_used_mb` counter (no such column exists; Doc 03
 * §3.7 describes one but it was never implemented anywhere in this repo).
 *
 * Overage flagging is now built (this session): Doc 00 §0.3 item 7 defines
 * the free-tier policy (800MB banner+email, 950MB queued-upload warning,
 * 1GB read-only + upgrade prompt) — this screen flags each 'free'-plan org
 * against those thresholds. 'pro'/'business' orgs show "Pas de seuil
 * défini" since no numeric limit exists for those plans anywhere in Doc
 * 00/03 — this screen doesn't invent one.
 */
export default function StorageMonitorPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">
        Surveillance du stockage
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Utilisation réelle par organisation, calculée à partir de{' '}
        <code className="rounded bg-neutral-50 px-1 py-0.5 text-[13px]">storage.objects</code>{' '}
        (bucket <code className="rounded bg-neutral-50 px-1 py-0.5 text-[13px]">org-files</code>).
        Seuils de dépassement (Doc 00 §0.3, plan gratuit uniquement) : 800 Mo, 950 Mo, 1 Go.
      </p>
      <StorageUsageTable />
    </div>
  );
}

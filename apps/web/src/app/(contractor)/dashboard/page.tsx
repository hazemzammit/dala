import { StatCard } from '@/components/ui/StatCard';

/**
 * Doc 04 §4.2.2 — Dashboard. Placeholder layout showing the card grid
 * pattern (Doc 05 §3.2): hero cash card spans 2 columns, paired with
 * smaller stat tiles. Replace the hardcoded values with real queries
 * (TanStack Query + Supabase) before this is production-ready.
 */
export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="font-display text-[23px] font-semibold text-neutral-900">
        Bonjour 👋
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <StatCard label="Net à payer cette semaine" value="—" loading />
        </div>
        <StatCard label="Chantiers actifs" value="—" loading />
        <StatCard label="Demandes en attente" value="—" loading />
      </div>
    </main>
  );
}

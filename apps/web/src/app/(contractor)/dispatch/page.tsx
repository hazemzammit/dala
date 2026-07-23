'use client';

import { CarIcon, ClockIcon, UsersThreeIcon, WarehouseIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';

type LaneKey = 'vehicles' | 'workers' | 'sites';

type DispatchItem = {
  id: string;
  name: string;
  meta: string;
  lane: LaneKey;
};

const initialItems: DispatchItem[] = [
  { id: 'veh-1', name: 'Toyota Hilux TN-1432', meta: 'Vehicle · available', lane: 'vehicles' },
  { id: 'veh-2', name: 'Renault Master TN-8811', meta: 'Vehicle · maintenance', lane: 'vehicles' },
  { id: 'wrk-1', name: 'Sami Haddad', meta: 'Worker · masonry', lane: 'workers' },
  { id: 'wrk-2', name: 'Amina Ben Ali', meta: 'Worker · finishing', lane: 'workers' },
  { id: 'site-1', name: 'El Baraka Residence', meta: 'Site · morning shift', lane: 'sites' },
  { id: 'site-2', name: 'Coastal Villas', meta: 'Site · concrete pour', lane: 'sites' },
];

export default function Page() {
  const [date, setDate] = useState('2026-07-21');
  const [items, setItems] = useState(initialItems);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return {
      vehicles: items.filter((item) => item.lane === 'vehicles'),
      workers: items.filter((item) => item.lane === 'workers'),
      sites: items.filter((item) => item.lane === 'sites'),
    };
  }, [items]);

  function moveItem(id: string, lane: LaneKey) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, lane } : item)));
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Dispatch planning"
        title="Drag workers into vehicles and assign them to construction sites."
        description="A daily planning board for crew allocation, route balancing, and morning dispatch confirmation."
        actions={
          <>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="bg-neutral-0 rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none"
            />
            <Button variant="secondary">Auto-balance crew</Button>
            <Button>Confirm dispatch</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5" raised>
          <div className="flex items-center gap-3">
            <div className="bg-accent-50 text-accent-700 rounded-2xl p-3">
              <CarIcon size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                Vehicles
              </p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {grouped.vehicles.length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5" raised>
          <div className="flex items-center gap-3">
            <div className="bg-accent-50 text-accent-700 rounded-2xl p-3">
              <UsersThreeIcon size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                Workers
              </p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {grouped.workers.length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5" raised>
          <div className="flex items-center gap-3">
            <div className="bg-accent-50 text-accent-700 rounded-2xl p-3">
              <WarehouseIcon size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                Sites
              </p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {grouped.sites.length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5" raised>
          <div className="flex items-center gap-3">
            <div className="bg-accent-50 text-accent-700 rounded-2xl p-3">
              <ClockIcon size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                Date
              </p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">21 Jul</p>
            </div>
          </div>
        </Card>
      </div>

      <SectionCard
        title="Dispatch board"
        description="Drag team cards across the lanes to adjust the day plan."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          {(
            [
              ['vehicles', 'Vehicles'],
              ['workers', 'Workers'],
              ['sites', 'Construction Sites'],
            ] as Array<[LaneKey, string]>
          ).map(([lane, title]) => (
            <div
              key={lane}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => draggedId && moveItem(draggedId, lane)}
              className="bg-neutral-25 rounded-[20px] border border-neutral-100 p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-neutral-900">{title}</h3>
                <StatusBadge variant="info">{grouped[lane].length}</StatusBadge>
              </div>
              <div className="space-y-3">
                {grouped[lane].map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggedId(item.id)}
                    onDragEnd={() => setDraggedId(null)}
                    className="bg-neutral-0 cursor-grab rounded-2xl border border-neutral-100 p-4 shadow-[0_4px_14px_rgba(17,19,24,0.04)] active:cursor-grabbing"
                  >
                    <p className="font-medium text-neutral-900">{item.name}</p>
                    <p className="mt-1 text-sm text-neutral-500">{item.meta}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Assignments"
        description="Today's confirmed allocations for vehicles and workers."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            {
              title: 'Hilux TN-1432',
              body: '3 workers assigned to El Baraka Residence',
              tone: 'success' as const,
            },
            {
              title: 'Master TN-8811',
              body: 'Maintenance hold - reassign after 14:00',
              tone: 'warning' as const,
            },
          ].map((item) => (
            <Card key={item.title} className="p-5">
              <StatusBadge variant={item.tone}>{item.title}</StatusBadge>
              <p className="mt-3 text-sm leading-6 text-neutral-500">{item.body}</p>
            </Card>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

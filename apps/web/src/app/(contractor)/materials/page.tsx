'use client';
import { PackageIcon } from '@phosphor-icons/react';

import { PageHeader, ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

type MaterialRow = {
  material: string;
  quantity: string;
  unit: string;
  supplier: string;
  purchasePrice: string;
  currentStock: number;
  project: string;
};

const rows: MaterialRow[] = [
  {
    material: 'Cement',
    quantity: '240',
    unit: 'bags',
    supplier: 'Société Sud Ciment',
    purchasePrice: '11,280 TND',
    currentStock: 72,
    project: 'El Baraka Residence',
  },
  {
    material: 'Rebar',
    quantity: '12',
    unit: 'tons',
    supplier: 'Tunis Steel',
    purchasePrice: '24,500 TND',
    currentStock: 58,
    project: 'Coastal Villas',
  },
  {
    material: 'Paint',
    quantity: '640',
    unit: 'liters',
    supplier: 'Color House',
    purchasePrice: '8,160 TND',
    currentStock: 31,
    project: 'School Annex',
  },
];

const columns: DataTableColumn<MaterialRow>[] = [
  {
    key: 'material',
    header: 'Material',
    render: (row) => <span className="font-medium text-neutral-900">{row.material}</span>,
    sortValue: (row) => row.material,
  },
  {
    key: 'quantity',
    header: 'Quantity',
    render: (row) => `${row.quantity} ${row.unit}`,
    sortValue: (row) => Number(row.quantity),
  },
  {
    key: 'supplier',
    header: 'Supplier',
    render: (row) => row.supplier,
    sortValue: (row) => row.supplier,
  },
  {
    key: 'purchasePrice',
    header: 'Purchase Price',
    render: (row) => row.purchasePrice,
    sortValue: (row) => row.purchasePrice,
  },
  {
    key: 'currentStock',
    header: 'Current Stock',
    render: (row) => (
      <div className="min-w-[140px]">
        <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
          <span>{row.currentStock}%</span>
          <span>{row.project}</span>
        </div>
        <ProgressBar
          value={row.currentStock}
          tone={row.currentStock > 50 ? 'success' : 'warning'}
        />
      </div>
    ),
    sortValue: (row) => row.currentStock,
  },
  {
    key: 'project',
    header: 'Project',
    render: (row) => row.project,
    sortValue: (row) => row.project,
  },
];

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Inventory"
        title="Materials"
        description="Track stock levels, suppliers, and purchase costs across all active projects."
      />

      <SectionCard
        title="Inventory health"
        description="Monitor materials before they hit a shortage."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Open requests', '14'],
            ['Low stock items', '3'],
            ['Pending purchase orders', '6'],
            ['This month spend', '84,320 TND'],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {label}
              </p>
              <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
            </Card>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Purchase ledger"
        description="Searchable material rows with sortable columns."
      >
        <DataTable columns={columns} rows={rows} getRowId={(row) => row.material} />
      </SectionCard>

      <SectionCard title="Supplier alerts" description="Priority reminders for replenishment.">
        <div className="space-y-3">
          {[
            'Rebar delivery due in 2 days for Coastal Villas',
            'Cement stock below 25% on School Annex',
            'Paint order awaiting approval',
          ].map((item) => (
            <div
              key={item}
              className="bg-neutral-25 rounded-2xl px-4 py-3 text-sm text-neutral-900"
            >
              {item}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

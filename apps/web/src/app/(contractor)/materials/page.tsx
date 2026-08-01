'use client';

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
    header: 'Matériau',
    render: (row) => <span className="font-medium text-neutral-900">{row.material}</span>,
    sortValue: (row) => row.material,
  },
  {
    key: 'quantity',
    header: 'Quantité',
    render: (row) => `${row.quantity} ${row.unit}`,
    sortValue: (row) => Number(row.quantity),
  },
  {
    key: 'supplier',
    header: 'Fournisseur',
    render: (row) => row.supplier,
    sortValue: (row) => row.supplier,
  },
  {
    key: 'purchasePrice',
    header: 'Prix d’achat',
    render: (row) => row.purchasePrice,
    sortValue: (row) => row.purchasePrice,
  },
  {
    key: 'currentStock',
    header: 'Stock actuel',
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
    header: 'Chantier',
    render: (row) => row.project,
    sortValue: (row) => row.project,
  },
];

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Inventaire"
        title="Matériaux"
        description="Suivez les stocks, les fournisseurs et les coûts d’achat sur tous les chantiers actifs."
      />

      <SectionCard
        title="État de l’inventaire"
        description="Surveillez les matériaux avant les ruptures de stock."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Demandes ouvertes', '14'],
            ['Articles en stock faible', '3'],
            ['Commandes en attente', '6'],
            ['Dépenses du mois', '84 320 TND'],
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
        title="Registre des achats"
        description="Lignes de matériaux recherchables avec colonnes triables."
      >
        <DataTable columns={columns} rows={rows} getRowId={(row) => row.material} />
      </SectionCard>

      <SectionCard
        title="Alertes fournisseurs"
        description="Rappels prioritaires pour le réapprovisionnement."
      >
        <div className="space-y-3">
          {[
            'Livraison de fer à béton dans 2 jours pour Coastal Villas',
            'Stock de ciment sous 25 % sur School Annex',
            'Commande de peinture en attente d’approbation',
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

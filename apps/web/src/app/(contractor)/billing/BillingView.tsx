'use client';

import { DownloadSimpleIcon, PlusIcon, ReceiptIcon } from '@phosphor-icons/react';
import { useState, useTransition } from 'react';

import { updateInvoiceStatus } from './actions';
import { InvoiceFormModal } from './InvoiceFormModal';

import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

type Invoice = {
  id: string;
  project_id: string;
  invoice_number: string;
  client_name: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  due_date: string;
  created_at: string;
};
type Project = { id: string; name: string };

const STATUS_LABEL: Record<Invoice['status'], string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
};
const STATUS_VARIANT: Record<Invoice['status'], 'neutral' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
};

export function BillingView({ invoices, projects }: { invoices: Invoice[]; projects: Project[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [rows, setRows] = useState(invoices);
  const [isPending, startTransition] = useTransition();

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  function handleMarkPaid(id: string) {
    startTransition(async () => {
      const result = await updateInvoiceStatus({ invoice_id: id, status: 'paid' });
      if (result.success) {
        setRows((current) =>
          current.map((inv) => (inv.id === id ? { ...inv, status: 'paid' } : inv)),
        );
      }
    });
  }

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'invoice_number',
      header: 'N° Facture',
      render: (i) => <span className="font-medium">{i.invoice_number}</span>,
      sortValue: (i) => i.invoice_number,
    },
    {
      key: 'client',
      header: 'Client',
      render: (i) => i.client_name,
    },
    {
      key: 'project',
      header: 'Chantier',
      render: (i) => projectNameById.get(i.project_id) ?? '—',
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (i) => `${i.amount.toLocaleString('fr-TN')} TND`,
      align: 'right',
      sortValue: (i) => i.amount,
    },
    {
      key: 'due_date',
      header: 'Échéance',
      render: (i) => new Date(i.due_date).toLocaleDateString('fr-TN'),
      sortValue: (i) => i.due_date,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (i) => (
        <StatusBadge variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (i) => {
        const pdfUrl = '/api/invoices/' + i.id + '/pdf';
        return (
          <div className="flex items-center justify-end gap-3">
            {i.status !== 'paid' && (
              <button
                onClick={() => handleMarkPaid(i.id)}
                disabled={isPending}
                className="text-success text-sm font-medium hover:underline"
              >
                Marquer payée
              </button>
            )}

            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              aria-label={'Télécharger le PDF de ' + i.invoice_number}
            >
              <DownloadSimpleIcon size={16} />
            </a>
          </div>
        );
      },
    },
  ];

  return (
    <>
      {invoices.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Aucune facture pour le moment"
          description="Créez votre première facture pour un chantier."
          actionLabel={projects.length > 0 ? 'Nouvelle facture' : undefined}
          onAction={projects.length > 0 ? () => setModalOpen(true) : undefined}
        />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setModalOpen(true)} disabled={projects.length === 0}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Nouvelle facture
            </Button>
          </div>
          <DataTable columns={columns} rows={rows} getRowId={(i) => i.id} />
        </>
      )}

      {modalOpen && <InvoiceFormModal projects={projects} onClose={() => setModalOpen(false)} />}
    </>
  );
}

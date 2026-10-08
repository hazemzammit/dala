'use client';

import { Button, Card, FormField } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { CheckCircleIcon, DownloadSimpleIcon, PlusIcon, ReceiptIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { createInvoice } from './actions';

type Project = { id: string; name: string; client_name: string | null };
type Invoice = {
  id: string;
  project_id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string;
  period_from: string;
  period_to: string;
  subtotal: number;
  notes: string | null;
};

function formatTND(value: number): string {
  return `${Number(value).toLocaleString('fr-TN')} TND`;
}

export function BillingView({ projects, invoices }: { projects: Project[]; invoices: Invoice[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '');
  const [formOpen, setFormOpen] = useState(false);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  const selectedProjectInvoices = invoices.filter((inv) => inv.project_id === selectedProjectId);

  function handleGenerate() {
    setError(null);
    if (!periodFrom || !periodTo || !dueDate) {
      setError('Tous les champs de date sont requis.');
      return;
    }

    startTransition(async () => {
      const result = await createInvoice({
        project_id: selectedProjectId,
        period_from: periodFrom,
        period_to: periodTo,
        due_date: dueDate,
        notes: notes || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setNotice('Facture générée.');
      setFormOpen(false);
      setPeriodFrom('');
      setPeriodTo('');
      setDueDate('');
      setNotes('');
      window.location.reload();
    });
  }

  /**
   * Mirrors mobile's client-portal.tsx handleDownloadInvoice exactly — a
   * direct fetch() with the session's bearer token, not
   * supabase.functions.invoke(), because the response is a binary
   * application/pdf body, not the JSON/text shape .invoke() expects.
   */
  async function handleDownload(invoiceId: string) {
    setDownloadingId(invoiceId);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session invalide.');

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-invoice-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ invoice_id: invoiceId }),
        },
      );
      if (!response.ok) throw new Error('Impossible de générer le PDF.');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `facture-${invoiceId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de télécharger la facture.');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        icon={ReceiptIcon}
        title="Factures"
        description="Générez des factures à partir des dépenses enregistrées par chantier et période."
      />

      {notice && (
        <div className="border-success/20 bg-success/10 text-success flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm">
          <CheckCircleIcon size={18} />
          {notice}
        </div>
      )}

      <SectionCard title="Chantier" description="Sélectionnez le chantier à facturer.">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.client_name ? ` · ${p.client_name}` : ''}
              </option>
            ))}
          </select>
          <Button onClick={() => setFormOpen((v) => !v)} variant="secondary">
            <PlusIcon size={16} className="me-1 inline" />
            Générer une facture
          </Button>
        </div>

        {formOpen && (
          <Card className="mt-4 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                label="Début de période"
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                required
              />
              <FormField
                label="Fin de période"
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                required
              />
              <FormField
                label="Date d'échéance"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div className="mt-4">
              <FormField
                label="Notes (facultatif)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Conditions de paiement, remarques…"
              />
            </div>
            {error && <p className="text-danger mt-3 text-sm">{error}</p>}
            <div className="mt-4 flex justify-end">
              <Button onClick={handleGenerate} loading={isPending}>
                Générer
              </Button>
            </div>
          </Card>
        )}
      </SectionCard>

      <SectionCard
        title="Factures émises"
        description="Snapshot figé des dépenses au moment de la génération — modifier une dépense plus tard ne change pas une facture déjà émise."
      >
        {selectedProjectInvoices.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune facture pour ce chantier.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedProjectInvoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-2xl border border-neutral-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Facture {inv.invoice_number}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Période du {new Date(inv.period_from).toLocaleDateString('fr-TN')} au{' '}
                    {new Date(inv.period_to).toLocaleDateString('fr-TN')} · Échéance{' '}
                    {new Date(inv.due_date).toLocaleDateString('fr-TN')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-neutral-900">
                    {formatTND(inv.subtotal)}
                  </span>
                  <button
                    onClick={() => handleDownload(inv.id)}
                    disabled={downloadingId === inv.id}
                    className="text-accent-600 hover:bg-accent-50 rounded-control p-1.5 disabled:opacity-50"
                    aria-label={`Télécharger la facture ${inv.invoice_number}`}
                  >
                    <DownloadSimpleIcon size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

'use client';

import { Button } from '@dala/ui-web';
import { requestDataExportSchema } from '@dala/validation';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';

const FORMATS: { value: 'csv' | 'json'; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
];

export function DataExportForm({ orgId }: { orgId: string }) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    const parsed = requestDataExportSchema.safeParse({ org_id: orgId, format });
    if (!parsed.success) {
      setError('Format invalide.');
      return;
    }

    setExporting(true);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke('export-org-data', {
        body: parsed.data,
      });
      if (fnError) throw fnError;

      const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dala-export-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError("Impossible de générer l'export.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <SectionCard
      title="Export des données"
      description="Chantiers, équipe, dispatch, avances, dépenses, matériaux, journal, sécurité, assurances."
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-neutral-900">Format</p>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
                  format === f.value
                    ? 'bg-accent-600 border-accent-600 text-white'
                    : 'border-neutral-300 text-neutral-900 hover:border-neutral-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        <div>
          <Button fullWidth={false} onClick={() => void handleExport()} loading={exporting}>
            <DownloadSimpleIcon size={16} className="me-1.5 inline" />
            Générer l&apos;export
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

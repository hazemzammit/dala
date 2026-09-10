'use client';

import { Button } from '@dala/ui-web';
import { useState } from 'react';

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * FLAGGED FOR HAZEM — the "Télécharger PDF" button and the
 * /api/reports/summary route behind it were dropped. That route (and two
 * others: /api/invoices/[id]/pdf and /api/journal/[projectId]/report) all
 * depend on @react-pdf/renderer, which Phase 1 deliberately excluded from
 * apps/web/package.json to avoid a second, parallel PDF-generation stack
 * alongside the real one (the generate-invoice-pdf Edge Function). The
 * invoices PDF route is moot anyway — Phase 3 rebuilds billing against
 * that Edge Function per your instructions, not this file. But the report-
 * summary and daily-journal-report PDF exports are real, independent
 * features with no equivalent elsewhere, and dropping @react-pdf/renderer
 * means dropping them too — not something to decide unilaterally. Options:
 * (a) accept @react-pdf/renderer as a second PDF path for these two
 * non-invoice exports, (b) rebuild them against the existing Edge
 * Function architecture instead, or (c) leave them out for now. Left out
 * (CSV export still works, no new dependency) pending that call.
 */
export function ReportsActions({
  revenue,
  expenses,
  profit,
  budgetUsedPercent,
}: {
  revenue: number;
  expenses: number;
  profit: number;
  budgetUsedPercent: number;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  function exportExcel() {
    const rows = [
      ['Chiffre d\u2019affaires', revenue.toString()],
      ['Bénéfice', profit.toString()],
      ['Dépenses', expenses.toString()],
      ['Budget utilisé (%)', budgetUsedPercent.toString()],
    ];
    const header = 'Indicateur,Valeur (TND)\n';
    const body = rows.map(([label, value]) => `${label},${value}`).join('\n');
    downloadFile('dala-rapport.csv', header + body, 'text/csv;charset=utf-8');
    setNotice('Export CSV téléchargé.');
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {notice && (
        <div className="border-success/20 bg-success/10 text-success rounded-2xl border px-3 py-2 text-xs">
          {notice}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={exportExcel}>Exporter CSV</Button>
      </div>
    </div>
  );
}

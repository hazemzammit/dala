'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
        <a href="/api/reports/summary" target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">Télécharger PDF</Button>
        </a>
        <Button onClick={exportExcel}>Exporter CSV</Button>
      </div>
    </div>
  );
}

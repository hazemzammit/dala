'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';

const REPORT_ROWS = [
  ['Revenue', '246,800 TND'],
  ['Profit', '61,250 TND'],
  ['Expenses', '185,550 TND'],
  ['Budget used', '68%'],
];

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsActions() {
  const [notice, setNotice] = useState<string | null>(null);

  function exportExcel() {
    const header = 'Metric,Value\n';
    const body = REPORT_ROWS.map(([label, value]) => `${label},${value}`).join('\n');
    downloadFile('dala-report.csv', header + body, 'text/csv;charset=utf-8');
    setNotice('Excel export downloaded as CSV.');
  }

  function downloadPdf() {
    const lines = [
      'Dala — Operational Report',
      'Generated: ' + new Date().toLocaleString('en-GB'),
      '',
      ...REPORT_ROWS.map(([label, value]) => `${label}: ${value}`),
    ];
    downloadFile('dala-report.txt', lines.join('\n'), 'text/plain;charset=utf-8');
    setNotice('PDF export downloaded (text summary until PDF engine is wired).');
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {notice && (
        <div className="border-success/20 bg-success/10 text-success rounded-2xl border px-3 py-2 text-xs">
          {notice}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={downloadPdf}>
          Download PDF
        </Button>
        <Button onClick={exportExcel}>Export Excel</Button>
      </div>
    </div>
  );
}

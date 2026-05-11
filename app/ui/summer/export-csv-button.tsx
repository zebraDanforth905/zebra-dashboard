'use client';

import { useTransition } from 'react';
import { ParentLinkRow } from '@/app/lib/definitions';
import { markTokensExported } from '@/app/lib/summer-actions';

function csv(val: string): string {
  const s = val ?? '';
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function formatStudentNamesGrammar(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export default function ExportCsvButton({
  rows,
  label = 'Export CSV',
  disabled = false,
}: {
  rows: ParentLinkRow[];
  label?: string;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    const origin = window.location.origin;
    const header = 'Email,Alternate Email,Alternate Name,Students,Link';
    const body = rows.map(r => {
      const students = formatStudentNamesGrammar(r.student_names);
      return [
        csv(r.email),
        csv(r.alternate_email ?? ''),
        csv(r.alternate_name ?? ''),
        csv(students),
        csv(`${origin}/summer-reg?token=${r.token}`),
      ].join(',');
    });

    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `summer-reg-links-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    const tokenIds = rows.map(r => r.token_id);
    if (tokenIds.length > 0) {
      startTransition(async () => {
        await markTokensExported(tokenIds);
      });
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled || isPending || rows.length === 0}
      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-500 transition disabled:opacity-40"
    >
      {isPending ? 'Exporting…' : `${label} (${rows.length})`}
    </button>
  );
}

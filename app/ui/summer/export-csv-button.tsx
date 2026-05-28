'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

function recipientCountForRow(row: ParentLinkRow): number {
  const primaryEmail = row.email?.trim();
  const alternateEmail = row.alternate_email?.trim();
  if (!primaryEmail) return alternateEmail ? 1 : 0;
  if (!alternateEmail) return 1;
  return alternateEmail.toLowerCase() === primaryEmail.toLowerCase() ? 1 : 2;
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const recipientCount = rows.reduce((count, row) => count + recipientCountForRow(row), 0);

  function handleExport() {
    const origin = window.location.origin;
    const header = 'Email,Parent Name,Students,Link';
    const body = rows.flatMap(r => {
      const students = formatStudentNamesGrammar(r.student_names);
      const link = `${origin}/summer-reg?token=${r.token}`;
      const primaryEmail = r.email?.trim();
      const alternateEmail = r.alternate_email?.trim();
      const recipientRows: string[] = [];

      if (primaryEmail) {
        recipientRows.push([
          csv(primaryEmail),
          csv(r.customer_name),
          csv(students),
          csv(link),
        ].join(','));
      }

      if (alternateEmail && alternateEmail.toLowerCase() !== primaryEmail?.toLowerCase()) {
        recipientRows.push([
          csv(alternateEmail),
          csv(r.alternate_name?.trim() || r.customer_name),
          csv(students),
          csv(link),
        ].join(','));
      }

      return recipientRows;
    });
    if (body.length === 0) return;

    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `summer-reg-links-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    const tokenIds = rows.filter(r => recipientCountForRow(r) > 0).map(r => r.token_id);
    if (tokenIds.length > 0) {
      startTransition(async () => {
        await markTokensExported(tokenIds);
        router.refresh();
      });
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled || isPending || recipientCount === 0}
      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-500 transition disabled:opacity-40"
    >
      {isPending ? 'Exporting…' : `${label} (${recipientCount})`}
    </button>
  );
}

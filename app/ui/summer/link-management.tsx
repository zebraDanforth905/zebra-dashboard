'use client';

import { useState } from 'react';
import { ParentLinkRow } from '@/app/lib/definitions';
import CopyLinkButton from './copy-link-button';
import GenerateTokensButton from './generate-tokens-button';
import ExportCsvButton from './export-csv-button';
import AlternateNameCell from './alternate-name-cell';
import RefreshLinksButton from './refresh-links-button';
import Link from 'next/link';

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

type FilterValue = 'all' | 'not_responded' | 'not_exported' | 'exported' | 'responded';

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all',           label: 'All families' },
  { value: 'not_responded', label: 'Not responded' },
  { value: 'not_exported',  label: 'Not exported' },
  { value: 'exported',      label: 'Exported' },
  { value: 'responded',     label: 'Responded' },
];

function applyFilter(rows: ParentLinkRow[], filter: FilterValue): ParentLinkRow[] {
  switch (filter) {
    case 'not_responded': return rows.filter(r => !r.has_responded);
    case 'responded':     return rows.filter(r => r.has_responded);
    case 'not_exported':  return rows.filter(r => r.export_count === 0);
    case 'exported':      return rows.filter(r => r.export_count > 0);
    default:              return rows;
  }
}

export default function LinkManagement({ rows }: { rows: ParentLinkRow[] }) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const filtered = applyFilter(rows, filter);

  const total = rows.length;
  const responded = rows.filter(r => r.has_responded).length;
  const missingEmail = rows.filter(r => !r.email).length;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <GenerateTokensButton />
        <div className="h-5 border-l border-slate-200 hidden sm:block" />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as FilterValue)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
        >
          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ExportCsvButton rows={filtered} label="Export CSV" />
        <div className="h-5 border-l border-slate-200 hidden sm:block" />
        <RefreshLinksButton />
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span><span className="font-semibold text-slate-800">{total}</span> families</span>
        <span><span className="font-semibold text-emerald-700">{responded}</span> responded</span>
        <span><span className="font-semibold text-slate-800">{total - responded}</span> not yet responded</span>
        {missingEmail > 0 && (
          <span className="text-amber-700 font-medium">⚠ {missingEmail} missing email</span>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} of {total} shown
        </span>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">
          No tokens generated yet. Click "Generate All Tokens" to create links for all active families.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-4 py-3">Family</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Exported</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No families match this filter.
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr key={row.token_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.customer_name}</div>
                    <AlternateNameCell customerId={row.customer_id} initialName={row.alternate_name} />
                  </td>
                  <td className="px-4 py-3">
                    {row.email ? (
                      <span className="text-slate-600">{row.email}</span>
                    ) : (
                      <span className="text-amber-600 font-medium">⚠ Missing</span>
                    )}
                    {row.alternate_email && (
                      <div className="mt-0.5 text-xs text-slate-400">
                        <span className="text-slate-300">2nd:</span> {row.alternate_email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.student_names.length > 0 ? row.student_names.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {row.has_responded ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Responded
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {formatDate(row.last_exported_at)}
                    {row.export_count > 0 && (
                      <span className="ml-1 text-slate-400">×{row.export_count}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CopyLinkButton token={row.token} />
                      <Link
                        href={`/summer-reg?token=${row.token}`}
                        target="_blank"
                        className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
                      >
                        Preview
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

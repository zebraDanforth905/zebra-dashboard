'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ParentLinkRow } from '@/app/lib/definitions';
import CopyLinkButton from './copy-link-button';
import GenerateTokensButton from './generate-tokens-button';
import ExportCsvButton from './export-csv-button';
import ClearExportButton from './clear-export-button';
import LockedFieldCell from './locked-field-cell';
import RefreshLinksButton from './refresh-links-button';
import Link from 'next/link';
import {
  updatePrimaryName,
  updateAlternateName,
  updatePrimaryEmail,
  updateAlternateEmail,
  unlockCustomerField,
  refreshEmailsFromPortal,
} from '@/app/lib/summer-actions';

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

type FilterValue =
  | 'all'
  | 'not_responded'
  | 'not_exported'
  | 'exported'
  | 'responded'
  | 'internal_responded'
  | 'august_fall_confirmation';

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all',           label: 'All families' },
  { value: 'not_responded', label: 'Needs email (not responded)' },
  { value: 'not_exported',  label: 'Not exported' },
  { value: 'exported',      label: 'Exported' },
  { value: 'responded',     label: 'Responded' },
  { value: 'internal_responded', label: 'Internal response' },
  { value: 'august_fall_confirmation', label: 'August fall confirmation' },
];
const DEFAULT_FILTER: FilterValue = 'not_responded';

function applyFilter(rows: ParentLinkRow[], filter: FilterValue): ParentLinkRow[] {
  switch (filter) {
    case 'not_responded': return rows.filter(r => !r.has_responded && !r.has_internal_response);
    case 'responded':     return rows.filter(r => r.has_responded);
    case 'not_exported':  return rows.filter(r => r.export_count === 0);
    case 'exported':      return rows.filter(r => r.export_count > 0);
    case 'internal_responded': return rows.filter(r => r.has_internal_response);
    case 'august_fall_confirmation': return rows.filter(r => r.fall_confirmation_eligible);
    default:              return rows;
  }
}

function matchesSearch(row: ParentLinkRow, search: string): boolean {
  if (!search) return true;
  const searchableText = [
    row.customer_name,
    row.alternate_name,
    ...row.student_names,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(search);
}

function tokenAlertText(count: number): string {
  if (count === 1) return '1 family needs token';
  return `${count} families need tokens`;
}

export default function LinkManagement({
  rows,
  untokenizedActiveFamilyCount = 0,
}: {
  rows: ParentLinkRow[];
  untokenizedActiveFamilyCount?: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>(DEFAULT_FILTER);
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () => applyFilter(rows, filter).filter(row => matchesSearch(row, normalizedSearch)),
    [filter, normalizedSearch, rows],
  );
  const exportRows = filtered;
  const exportLabel =
    filter === 'not_responded' ? 'Export email CSV'
    : filter === 'august_fall_confirmation' ? 'Export August CSV'
    : 'Export CSV';

  const total = rows.length;
  const responded = rows.filter(r => r.has_responded).length;
  const internalResponded = rows.filter(r => r.has_internal_response).length;
  const needsEmail = rows.filter(r => !r.has_responded && !r.has_internal_response).length;
  const augustEligible = rows.filter(r => r.fall_confirmation_eligible).length;
  const missingEmail = rows.filter(r => !r.email).length;

  const [isRefreshing, startRefresh] = useTransition();
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  function handleRefreshEmails() {
    setRefreshResult(null);
    startRefresh(async () => {
      try {
        const res = await refreshEmailsFromPortal();
        setRefreshResult(
          `Checked ${res.scanned} from portal · updated ${res.updated}` +
            (res.fetchFailed > 0 ? ` · ${res.fetchFailed} fetch failed` : ''),
        );
        router.refresh();
      } catch (err) {
        setRefreshResult(err instanceof Error ? err.message : 'Refresh failed');
      }
    });
  }

  return (
    <div className="space-y-4">
      {untokenizedActiveFamilyCount > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {tokenAlertText(untokenizedActiveFamilyCount)}. Generate All Tokens before exporting emails.
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 2xl:flex-nowrap">
        <GenerateTokensButton />
        <div className="hidden h-5 shrink-0 border-l border-slate-200 sm:block" />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as FilterValue)}
          className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
        >
          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="search"
          placeholder="Search names…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 sm:w-56 2xl:w-48"
        />
        {(filter !== DEFAULT_FILTER || search) && (
          <button
            onClick={() => { setFilter(DEFAULT_FILTER); setSearch(''); }}
            className="text-xs text-slate-500 underline"
          >
            Clear
          </button>
        )}
        <ExportCsvButton rows={exportRows} label={exportLabel} />
        <ClearExportButton rows={filtered} />
        <div className="hidden h-5 shrink-0 border-l border-slate-200 sm:block" />
        <RefreshLinksButton />
        <div className="flex min-w-[11rem] shrink-0 flex-col items-start gap-1">
          {refreshResult && (
            <span className="max-w-48 text-xs leading-tight text-slate-500">{refreshResult}</span>
          )}
          <button
            onClick={handleRefreshEmails}
            disabled={isRefreshing}
            className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-40"
            title="Pull primary + alternate emails from portal family-view for every family (skips locked fields)"
          >
            {isRefreshing ? 'Syncing emails…' : 'Sync Emails from Portal'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span><span className="font-semibold text-slate-800">{total}</span> families</span>
        <span><span className="font-semibold text-sky-700">{needsEmail}</span> need email</span>
        <span><span className="font-semibold text-emerald-700">{augustEligible}</span> August fall confirmation</span>
        <span><span className="font-semibold text-emerald-700">{responded}</span> responded</span>
        <span><span className="font-semibold text-amber-700">{internalResponded}</span> internal response</span>
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
          No family links found. Use Generate All Tokens to create links for families with active students.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="px-4 py-3">Family</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Alternate Email</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Exported</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No families match this filter.
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr key={row.token_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 space-y-0.5">
                    <LockedFieldCell
                      customerId={row.customer_id}
                      initialValue={row.customer_name}
                      locked={row.name_locked}
                      field="name"
                      placeholder="Primary name"
                      save={updatePrimaryName}
                      unlock={unlockCustomerField}
                      valueClassName="font-medium text-slate-800"
                      width="w-52"
                    />
                    <LockedFieldCell
                      customerId={row.customer_id}
                      initialValue={row.alternate_name}
                      locked={row.alternate_name_locked}
                      field="alternate_name"
                      placeholder="Second parent name"
                      displayPrefix="&"
                      allowEmpty
                      save={updateAlternateName}
                      unlock={unlockCustomerField}
                      valueClassName="text-xs text-slate-500"
                      width="w-44"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {row.email ? (
                      <LockedFieldCell
                        customerId={row.customer_id}
                        initialValue={row.email}
                        locked={row.email_locked}
                        field="email"
                        inputType="email"
                        placeholder="primary@email.com"
                        save={updatePrimaryEmail}
                        unlock={unlockCustomerField}
                        valueClassName="text-slate-600"
                        width="w-56"
                      />
                    ) : (
                      <span className="text-amber-600 font-medium">⚠ Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <LockedFieldCell
                      customerId={row.customer_id}
                      initialValue={row.alternate_email}
                      locked={row.alternate_email_locked}
                      field="alternate_email"
                      inputType="email"
                      placeholder="alternate@email.com"
                      allowEmpty
                      save={updateAlternateEmail}
                      unlock={unlockCustomerField}
                      valueClassName="text-slate-500 text-xs"
                      width="w-56"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.student_names.length > 0 ? row.student_names.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {row.has_internal_response ? (
                      <span className="inline-flex flex-col items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium leading-tight text-amber-800">
                        <span>Internal</span>
                        <span>response</span>
                      </span>
                    ) : row.has_responded ? (
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
                        href={`/summer-reg?token=${row.token}&staff=1`}
                        target="_blank"
                        className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded border border-slate-200 bg-white px-3 text-xs leading-none text-slate-600 transition hover:bg-slate-50"
                      >
                        Staff Entry
                      </Link>
                      <Link
                        href={`/summer-reg?token=${row.token}`}
                        target="_blank"
                        className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded border border-slate-200 bg-white px-3 text-xs leading-none text-slate-600 transition hover:bg-slate-50"
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

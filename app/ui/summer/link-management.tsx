import { ParentLinkRow } from '@/app/lib/definitions';
import CopyLinkButton from './copy-link-button';
import GenerateTokensButton from './generate-tokens-button';
import ExportCsvButton from './export-csv-button';
import AlternateEmailCell from './alternate-email-cell';
import MarkSentButton from './mark-sent-button';
import Link from 'next/link';

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LinkManagement({ rows }: { rows: ParentLinkRow[] }) {
  const total = rows.length;
  const responded = rows.filter(r => r.has_responded).length;
  const notResponded = rows.filter(r => !r.has_responded);
  const missingEmail = rows.filter(r => !r.email).length;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <GenerateTokensButton />
        <div className="h-5 border-l border-slate-200 hidden sm:block" />
        <ExportCsvButton rows={rows} label="Export All" />
        <ExportCsvButton rows={notResponded} label="Export Non-Responders" />
        <div className="h-5 border-l border-slate-200 hidden sm:block" />
        <MarkSentButton />
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span><span className="font-semibold text-slate-800">{total}</span> families</span>
        <span><span className="font-semibold text-emerald-700">{responded}</span> responded</span>
        <span><span className="font-semibold text-slate-800">{total - responded}</span> not yet responded</span>
        {missingEmail > 0 && (
          <span className="text-amber-700 font-medium">⚠ {missingEmail} missing email</span>
        )}
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
                <th className="px-4 py-3">Last Emailed</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(row => (
                <tr key={row.token_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.customer_name}</td>
                  <td className="px-4 py-3">
                    {row.email ? (
                      <span className="text-slate-600">{row.email}</span>
                    ) : (
                      <span className="text-amber-600 font-medium">⚠ Missing</span>
                    )}
                    <div className="mt-0.5">
                      <AlternateEmailCell
                        customerId={row.customer_id}
                        initialEmail={row.alternate_email}
                      />
                    </div>
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
                    {formatDate(row.email_sent_at)}
                    {row.email_sent_count > 0 && (
                      <span className="ml-1 text-slate-400">×{row.email_sent_count}</span>
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

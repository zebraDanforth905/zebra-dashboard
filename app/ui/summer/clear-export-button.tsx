'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ParentLinkRow } from '@/app/lib/definitions';
import { clearExportedForTokens } from '@/app/lib/summer-actions';

export default function ClearExportButton({ rows }: { rows: ParentLinkRow[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const eligible = rows.filter(r => r.export_count > 0);

  function handleClick() {
    if (eligible.length === 0) return;
    setConfirm(true);
  }

  function handleConfirm() {
    startTransition(async () => {
      const { updated } = await clearExportedForTokens(eligible.map(r => r.token_id));
      setMessage(`Cleared export status for ${updated} families.`);
      setConfirm(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={eligible.length === 0 || isPending}
        title="Test-only: resets export counts and timestamps for filtered families"
        className="shrink-0 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
      >
        Clear Export ({eligible.length})
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirm(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Clear Export Status</h2>
            <p className="text-sm text-slate-600">
              Reset export count and last-exported timestamp for{' '}
              <span className="font-semibold text-slate-800">{eligible.length}</span> filtered famil{eligible.length === 1 ? 'y' : 'ies'}?
            </p>
            <p className="text-xs text-amber-700">
              Test-only action. Does not affect tokens or responses.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setConfirm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition disabled:opacity-50"
              >
                {isPending ? 'Clearing…' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

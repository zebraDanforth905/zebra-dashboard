'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshParentLinkData } from '@/app/lib/summer-actions';

export default function RefreshLinksButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshParentLinkData();
      setMessage(result.skipped ? 'Snapshot columns missing' : `Snapshot refreshed for ${result.updated} families`);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-[11rem] shrink-0 flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        title="Refresh last active snapshots from current active enrolments"
        className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
      >
        {isPending ? 'Refreshing…' : 'Refresh Active Snapshot'}
      </button>
      {message && <span className="max-w-48 text-xs leading-tight text-slate-500">{message}</span>}
    </div>
  );
}

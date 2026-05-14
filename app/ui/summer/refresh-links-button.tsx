'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshParentLinkData } from '@/app/lib/summer-actions';

export default function RefreshLinksButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await refreshParentLinkData();
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
    >
      {isPending ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}

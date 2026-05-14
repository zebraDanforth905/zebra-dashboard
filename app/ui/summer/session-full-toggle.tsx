'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleSessionFull } from '@/app/lib/summer-actions';

export default function SessionFullToggle({
  sessionId,
  isFull,
}: {
  sessionId: string;
  isFull: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleSessionFull(sessionId, !isFull);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded transition disabled:opacity-50 ${
        isFull
          ? 'bg-red-100 text-red-700 hover:bg-red-200'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
      title={isFull ? 'Click to mark as available' : 'Click to mark as full'}
    >
      {isPending ? '…' : isFull ? 'Full' : 'Mark Full'}
    </button>
  );
}

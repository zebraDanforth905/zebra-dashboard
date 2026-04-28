'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAllParentTokens } from '@/app/lib/summer-actions';

export default function DeleteAllTokensButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    if (!confirm('Delete ALL parent tokens? This cannot be undone.')) return;
    setMessage(null);
    startTransition(async () => {
      const { deleted } = await deleteAllParentTokens();
      setMessage(`Deleted ${deleted} token${deleted !== 1 ? 's' : ''}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-500 transition disabled:opacity-50"
      >
        {isPending ? 'Deleting…' : 'Delete All Tokens'}
      </button>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}

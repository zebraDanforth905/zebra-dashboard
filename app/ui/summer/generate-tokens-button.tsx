'use client';

import { useTransition, useState } from 'react';
import { generateAllParentTokens } from '@/app/lib/summer-actions';

export default function GenerateTokensButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const { created } = await generateAllParentTokens();
      setMessage(
        created === 0
          ? 'All families already have tokens.'
          : `Generated ${created} new token${created !== 1 ? 's' : ''}.`,
      );
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-500 transition disabled:opacity-50"
      >
        {isPending ? 'Generating…' : 'Generate All Tokens'}
      </button>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}

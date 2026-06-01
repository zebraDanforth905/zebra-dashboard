'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateAllParentTokens } from '@/app/lib/summer-actions';

export default function GenerateTokensButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const { created } = await generateAllParentTokens();
      setMessage(
        created === 0
          ? 'All families already have tokens.'
          : `Generated ${created} new token${created !== 1 ? 's' : ''}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-[11rem] shrink-0 flex-col items-start gap-1">
      {message && <p className="max-w-44 text-xs leading-tight text-slate-600">{message}</p>}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="whitespace-nowrap rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-500 transition disabled:opacity-50"
      >
        {isPending ? 'Generating…' : 'Generate All Tokens'}
      </button>
    </div>
  );
}

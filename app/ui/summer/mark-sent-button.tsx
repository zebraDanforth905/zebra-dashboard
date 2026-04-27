'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { markAllEmailSent, markNonRespondersEmailSent } from '@/app/lib/summer-actions';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

export default function MarkSentButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function run(action: () => Promise<{ updated: number }>, label: string) {
    setOpen(false);
    setMessage(null);
    startTransition(async () => {
      const { updated } = await action();
      setMessage(
        updated === 0
          ? 'Nothing to update.'
          : `Marked ${updated} ${label} as sent.`,
      );
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div ref={ref} className="relative">
        <button
          disabled={isPending}
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
        >
          {isPending ? 'Updating…' : 'Mark Sent'}
          <ChevronDownIcon className="h-3.5 w-3.5 text-slate-400" />
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg z-10">
            <button
              onClick={() => run(markAllEmailSent, 'families')}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg"
            >
              <div className="font-medium">Mark All Sent</div>
              <div className="text-xs text-slate-400 mt-0.5">Use after your first send or the August round</div>
            </button>
            <div className="border-t border-slate-100" />
            <button
              onClick={() => run(markNonRespondersEmailSent, 'non-responders')}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 rounded-b-lg"
            >
              <div className="font-medium">Mark Non-Responders Sent</div>
              <div className="text-xs text-slate-400 mt-0.5">Use for follow-up emails to families who haven't submitted</div>
            </button>
          </div>
        )}
      </div>

      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}

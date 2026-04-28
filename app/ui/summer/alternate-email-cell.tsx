'use client';

import { useState, useTransition, useRef } from 'react';
import { updateAlternateEmail } from '@/app/lib/summer-actions';

export default function AlternateEmailCell({
  customerId,
  initialEmail,
}: {
  customerId: string;
  initialEmail: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialEmail ?? '');
  const [saved, setSaved] = useState(initialEmail ?? '');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancel() {
    setValue(saved);
    setEditing(false);
  }

  function save() {
    const trimmed = value.trim();
    startTransition(async () => {
      await updateAlternateEmail(customerId, trimmed || null);
      setSaved(trimmed);
      setEditing(false);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="email"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="alternate@email.com"
          className="w-44 rounded border border-sky-300 px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
        <button
          onClick={save}
          disabled={isPending}
          className="text-xs text-sky-600 font-medium disabled:opacity-50"
        >
          {isPending ? '…' : 'Save'}
        </button>
        <button onClick={cancel} className="text-xs text-slate-400">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group">
      {saved ? (
        <span className="text-xs text-slate-400">
          <span className="text-slate-300">2nd:</span> {saved}
        </span>
      ) : null}
      <button
        onClick={startEdit}
        className="text-xs text-slate-300 hover:text-sky-500 opacity-0 group-hover:opacity-100 transition"
      >
        {saved ? 'edit' : '+ 2nd email'}
      </button>
    </div>
  );
}

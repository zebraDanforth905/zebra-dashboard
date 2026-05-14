'use client';

import { useState, useTransition, useRef } from 'react';

type FieldKind = 'name' | 'email' | 'alternate_email' | 'alternate_name';

type Props = {
  customerId: string;
  initialValue: string | null;
  locked: boolean;
  field: FieldKind;
  // 'email' | 'text' input type
  inputType?: 'email' | 'text';
  placeholder?: string;
  // Render label prefix on display, e.g. "2nd: " for alternate email
  displayPrefix?: string;
  // Allow empty (clear field)?
  allowEmpty?: boolean;
  // Save action — throws on validation error
  save: (customerId: string, value: string | null) => Promise<void>;
  // Unlock action
  unlock: (customerId: string, field: FieldKind) => Promise<void>;
  // Visual size hint for input
  width?: string;
  // Text color/class for displayed value
  valueClassName?: string;
};

export default function LockedFieldCell({
  customerId,
  initialValue,
  locked: initialLocked,
  field,
  inputType = 'text',
  placeholder,
  displayPrefix,
  allowEmpty = false,
  save,
  unlock,
  width = 'w-52',
  valueClassName = 'text-slate-600',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? '');
  const [saved, setSaved] = useState(initialValue ?? '');
  const [locked, setLocked] = useState(initialLocked);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancel() {
    setValue(saved);
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    const trimmed = value.trim();
    if (!allowEmpty && !trimmed) {
      setError('Cannot be empty.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await save(customerId, trimmed || null);
        setSaved(trimmed);
        setLocked(true);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  function handleUnlock() {
    startTransition(async () => {
      try {
        await unlock(customerId, field);
        setLocked(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unlock');
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') cancel();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`${width} rounded border border-sky-300 px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-400`}
          />
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-xs text-sky-600 font-medium disabled:opacity-50"
          >
            {isPending ? '…' : 'Save'}
          </button>
          <button onClick={cancel} className="text-xs text-slate-400">
            Cancel
          </button>
        </div>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group">
      {saved ? (
        <span className={`${valueClassName} text-sm`}>
          {displayPrefix && <span className="text-slate-300 text-xs mr-0.5">{displayPrefix}</span>}
          {saved}
        </span>
      ) : (
        <button
          onClick={startEdit}
          className="text-xs text-slate-300 italic hover:text-sky-500"
        >
          {placeholder ? `+ ${placeholder}` : '+ add'}
        </button>
      )}
      {locked && (
        <button
          onClick={handleUnlock}
          disabled={isPending}
          title="Locked — click to unlock and resume portal sync"
          className="text-xs text-amber-600 hover:text-amber-800 disabled:opacity-50"
        >
          🔒
        </button>
      )}
      {saved && (
        <button
          onClick={startEdit}
          className="text-xs text-slate-300 hover:text-sky-500 opacity-0 group-hover:opacity-100 transition"
        >
          edit
        </button>
      )}
    </div>
  );
}

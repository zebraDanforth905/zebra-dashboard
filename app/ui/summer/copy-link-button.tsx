'use client';

import { useState } from 'react';

export default function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = `${window.location.origin}/summer-reg?token=${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded border border-slate-200 bg-white px-3 text-xs leading-none text-slate-600 transition hover:bg-slate-50"
    >
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}

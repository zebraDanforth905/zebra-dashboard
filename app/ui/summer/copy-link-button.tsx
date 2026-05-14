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
      className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
    >
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}

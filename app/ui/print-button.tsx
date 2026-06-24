'use client';

import { useEffect, useRef, useState } from 'react';
import { PrinterIcon } from "@heroicons/react/24/outline";

export default function PrintButton({
  label = "Print",
  title = "Print slips",
}: {
  label?: string;
  title?: string;
}) {
  const [fallbackMessage, setFallbackMessage] = useState('');
  const printEventSeenRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleBeforePrint = () => {
      printEventSeenRef.current = true;
      setFallbackMessage('');
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };

    const handleAfterPrint = () => {
      setFallbackMessage('');
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const handlePrint = () => {
    setFallbackMessage('');
    printEventSeenRef.current = false;

    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
    }

    window.requestAnimationFrame(() => {
      try {
        window.print();
      } catch (error) {
        console.error('Print dialog failed to open:', error);
        setFallbackMessage('Print dialog could not open. Press Command+P or use your browser print menu.');
        return;
      }

      fallbackTimerRef.current = window.setTimeout(() => {
        if (!printEventSeenRef.current) {
          setFallbackMessage('If the print dialog did not open, press Command+P or use your browser print menu.');
        }
      }, 1200);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <button
        aria-label={label}
        onClick={handlePrint}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
        title={title}
        type="button"
      >
        <PrinterIcon aria-hidden="true" className="w-5 h-5" />
        {label}
      </button>
      {fallbackMessage ? (
        <p className="max-w-80 text-right text-xs font-medium text-slate-600">
          {fallbackMessage}
        </p>
      ) : null}
    </div>
  );
}

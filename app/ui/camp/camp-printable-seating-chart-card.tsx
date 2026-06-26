'use client';

import { useState, type ReactNode } from 'react';

export default function CampPrintableSeatingChartCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [included, setIncluded] = useState(true);

  return (
    <div className={included ? '' : 'print:hidden'}>
      <label className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-600 print:hidden">
        <input
          type="checkbox"
          checked={included}
          onChange={(event) => setIncluded(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
        Include {label} in the printout
      </label>
      <div className={included ? '' : 'opacity-40'}>{children}</div>
    </div>
  );
}

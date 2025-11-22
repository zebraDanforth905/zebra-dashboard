'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';

export default function QBOFilter() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const currentFilter = searchParams.get('qboFilter') || 'all';

  function handleFilterChange(value: string) {
    const params = new URLSearchParams(searchParams);
    
    if (value === 'all') {
      params.delete('qboFilter');
    } else {
      params.set('qboFilter', value);
    }
    
    // Reset to page 1 when filtering
    params.set('page', '1');
    
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-slate-700">QBO Status:</label>
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        <button
          onClick={() => handleFilterChange('all')}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            currentFilter === 'all'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          All
        </button>
        <button
          onClick={() => handleFilterChange('setup')}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            currentFilter === 'setup'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Set Up
        </button>
        <button
          onClick={() => handleFilterChange('not-setup')}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            currentFilter === 'not-setup'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Not Set Up
        </button>
      </div>
    </div>
  );
}

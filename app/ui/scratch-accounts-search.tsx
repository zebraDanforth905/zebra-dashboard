'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';

export default function ScratchAccountsSearch({ 
  query, 
  unassignedOnly 
}: { 
  query: string; 
  unassignedOnly: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleSearchChange = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set('query', term);
    } else {
      params.delete('query');
    }
    replace(`${pathname}?${params.toString()}`);
  }, 300);

  const handleFilterChange = (checked: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (checked) {
      params.set('unassignedOnly', 'true');
    } else {
      params.delete('unassignedOnly');
    }
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex flex-1 flex-shrink-0 max-w-md">
        <label htmlFor="scratch-search" className="sr-only">
          Search
        </label>
        <input
          id="scratch-search"
          className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
          placeholder="Search by username, laptop number, or student..."
          onChange={(e) => handleSearchChange(e.target.value)}
          defaultValue={searchParams.get('query')?.toString()}
        />
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
      </div>
      
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unassignedOnly}
          onChange={(e) => handleFilterChange(e.target.checked)}
          className="rounded border-gray-300"
        />
        Show unassigned only
      </label>
    </div>
  );
}

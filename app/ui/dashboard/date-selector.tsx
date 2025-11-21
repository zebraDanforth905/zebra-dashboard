'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarIcon } from '@heroicons/react/24/outline';

export default function DateSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    
    if (newDate) {
      params.set('date', newDate);
    } else {
      params.delete('date');
    }
    
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div className="relative inline-flex items-center">
      <div className="absolute left-3 pointer-events-none">
        <CalendarIcon className="h-5 w-5 text-slate-400" />
      </div>
      <input
        type="date"
        value={currentDate}
        onChange={handleDateChange}
        className="pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white text-slate-900"
      />
    </div>
  );
}

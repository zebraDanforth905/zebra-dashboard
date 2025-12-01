'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { AdjustmentsHorizontalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

type FilterType = 'qbo' | 'balance' | 'students' | 'recurringPayments' | 'scheduledInvoices' | 'paymentMatch';

interface FilterOption {
  value: string;
  label: string;
}

const filterOptions: Record<FilterType, FilterOption[]> = {
  qbo: [
    { value: 'all', label: 'All' },
    { value: 'setup', label: 'Set Up' },
    { value: 'not-setup', label: 'Not Set Up' },
  ],
  balance: [
    { value: 'all', label: 'All' },
    { value: 'has-balance', label: 'Has Balance' },
    { value: 'no-balance', label: 'No Balance' },
  ],
  students: [
    { value: 'all', label: 'All' },
    { value: 'has-students', label: 'Has Students' },
    { value: 'no-students', label: 'No Students' },
    { value: 'has-active-students', label: 'Has Active Students' },
    { value: 'no-active-students', label: 'No Active Students' },
  ],
  recurringPayments: [
    { value: 'all', label: 'All' },
    { value: 'has-next-payment', label: 'Has Next Payment' },
    { value: 'no-next-payment', label: 'No Next Payment' },
  ],
  scheduledInvoices: [
    { value: 'all', label: 'All' },
    { value: 'has-next-invoice', label: 'Has Next Invoice' },
    { value: 'no-next-invoice', label: 'No Next Invoice' },
  ],
  paymentMatch: [
    { value: 'all', label: 'All' },
    { value: 'match', label: 'Payment & Invoice Match' },
    { value: 'mismatch', label: 'Payment & Invoice Mismatch' },
  ],
};

export default function CustomerFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const currentFilters = {
    qbo: searchParams.get('qboFilter') || 'all',
    balance: searchParams.get('balanceFilter') || 'all',
    students: searchParams.get('studentsFilter') || 'all',
    recurringPayments: searchParams.get('recurringPaymentsFilter') || 'all',
    scheduledInvoices: searchParams.get('scheduledInvoicesFilter') || 'all',
    paymentMatch: searchParams.get('paymentMatchFilter') || 'all',
  };

  // Count active filters
  const activeFiltersCount = Object.values(currentFilters).filter(v => v !== 'all').length;

  function handleFilterChange(filterType: FilterType, value: string) {
    const params = new URLSearchParams(searchParams);
    
    const paramName = `${filterType}Filter`;
    
    if (value === 'all') {
      params.delete(paramName);
    } else {
      params.set(paramName, value);
    }
    
    // Reset to page 1 when filtering
    params.set('page', '1');
    
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearAllFilters() {
    const params = new URLSearchParams(searchParams);
    params.delete('qboFilter');
    params.delete('balanceFilter');
    params.delete('studentsFilter');
    params.delete('recurringPaymentsFilter');
    params.delete('scheduledInvoicesFilter');
    params.delete('paymentMatchFilter');
    params.set('page', '1');
    
    router.replace(`${pathname}?${params.toString()}`);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
      >
        <AdjustmentsHorizontalIcon className="h-4 w-4" />
        Filters
        {activeFiltersCount > 0 && (
          <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-bold text-white bg-sky-600 rounded-full">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-[480px] max-h-[80vh] overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-xl z-40 p-4">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white pb-2 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Filter Customers</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* QBO Status Filter */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  QuickBooks Online Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.qbo.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleFilterChange('qbo', option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        currentFilters.qbo === option.value
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Balance Filter */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Balance Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.balance.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleFilterChange('balance', option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        currentFilters.balance === option.value
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Students Filter */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Student Assignment
                </label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.students.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleFilterChange('students', option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        currentFilters.students === option.value
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurring Payments Filter */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Converge Recurring Payments
                </label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.recurringPayments.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleFilterChange('recurringPayments', option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        currentFilters.recurringPayments === option.value
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scheduled Invoices Filter */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Scheduled Recurring Invoices
                </label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.scheduledInvoices.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleFilterChange('scheduledInvoices', option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        currentFilters.scheduledInvoices === option.value
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Match Filter */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Payment & Invoice Alignment
                </label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.paymentMatch.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleFilterChange('paymentMatch', option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        currentFilters.paymentMatch === option.value
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Clear All Button */}
            {activeFiltersCount > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <button
                  onClick={clearAllFilters}
                  className="w-full px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

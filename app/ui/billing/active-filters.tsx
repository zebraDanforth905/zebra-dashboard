'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { XMarkIcon } from '@heroicons/react/24/outline';

const filterLabels: Record<string, Record<string, string>> = {
  qboFilter: {
    setup: 'QBO: Set Up',
    'not-setup': 'QBO: Not Set Up',
  },
  balanceFilter: {
    'has-balance': 'Balance: Has Balance',
    'no-balance': 'Balance: No Balance',
  },
  studentsFilter: {
    'has-students': 'Students: Has Students',
    'no-students': 'Students: No Students',
    'has-active-students': 'Students: Has Active Students',
    'no-active-students': 'Students: No Active Students',
  },
  paymentsFilter: {
    'has-recurring': 'Payments: Has Recurring',
    'has-invoices': 'Payments: Has Scheduled Invoices',
    'no-upcoming': 'Payments: No Upcoming',
  },
  recurringPaymentsFilter: {
    'has-next-payment': 'Converge: Has Next Payment',
    'no-next-payment': 'Converge: No Next Payment',
  },
  scheduledInvoicesFilter: {
    'has-next-invoice': 'Invoices: Has Next Invoice',
    'no-next-invoice': 'Invoices: No Next Invoice',
  },
  paymentMatchFilter: {
    match: 'Match: Payment & Invoice Aligned',
    mismatch: 'Match: Payment & Invoice Misaligned',
  },
};

export default function ActiveFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const activeFilters: Array<{ key: string; value: string; label: string }> = [];

  // Collect active filters
  ['qboFilter', 'balanceFilter', 'studentsFilter', 'paymentsFilter', 'recurringPaymentsFilter', 'scheduledInvoicesFilter', 'paymentMatchFilter'].forEach((filterKey) => {
    const value = searchParams.get(filterKey);
    if (value && value !== 'all') {
      const label = filterLabels[filterKey]?.[value] || value;
      activeFilters.push({ key: filterKey, value, label });
    }
  });

  if (activeFilters.length === 0) {
    return null;
  }

  function removeFilter(filterKey: string) {
    const params = new URLSearchParams(searchParams);
    params.delete(filterKey);
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearAllFilters() {
    const params = new URLSearchParams(searchParams);
    ['qboFilter', 'balanceFilter', 'studentsFilter', 'paymentsFilter', 'recurringPaymentsFilter', 'scheduledInvoicesFilter', 'paymentMatchFilter'].forEach((key) => {
      params.delete(key);
    });
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-slate-600">Active filters:</span>
      {activeFilters.map((filter) => (
        <button
          key={filter.key}
          onClick={() => removeFilter(filter.key)}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 transition-colors"
        >
          {filter.label}
          <XMarkIcon className="h-3 w-3" />
        </button>
      ))}
      {activeFilters.length > 1 && (
        <button
          onClick={clearAllFilters}
          className="text-xs font-medium text-red-600 hover:text-red-700 underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

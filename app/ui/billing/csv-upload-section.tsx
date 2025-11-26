'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import RecurringCSVUpload from './recurring-csv-upload';
import SettledBatchCSVUpload from './settled-batch-upload';

type Customer = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  customers: Customer[];
};

export default function CSVUploadSection({ customers }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">CSV Uploads</span>
          <span className="text-xs text-slate-500">(Recurring & Settled Payments)</span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-slate-400" />
        )}
      </button>
      
      {isExpanded && (
        <div className="border-t border-slate-200 p-3 space-y-3">
          <RecurringCSVUpload customers={customers} />
          <SettledBatchCSVUpload customers={customers} />
        </div>
      )}
    </div>
  );
}

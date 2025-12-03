'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChatBubbleLeftIcon, EyeSlashIcon, EyeIcon } from '@heroicons/react/24/outline';
import CustomerNotesModal from './customer-notes-modal';
import { formatDate } from '@/app/lib/utils';

type InvoiceDiscrepancy = {
  customer_id: string;
  customer_name: string;
  expected_amount: number;
  recurring_invoice_id: string | null;
  recurring_invoice_amount: number | null;
  recurring_invoice_next_date: Date | null;
  difference: number | null;
  enrollment_count: number;
  pickup_count: number;
  recent_note: string | null;
  note_date: Date | null;
  note_creator: string | null;
};

type Props = {
  discrepancies: InvoiceDiscrepancy[];
  currentUserName: string;
};

export default function InvoiceDiscrepanciesTable({ discrepancies, currentUserName }: Props) {
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string;
    note: string | null;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [ignoredCustomers, setIgnoredCustomers] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load ignored customers from sessionStorage
    const stored = sessionStorage.getItem('ignoredDiscrepancies');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setIgnoredCustomers(new Set(parsed));
      } catch (error) {
        console.error('Failed to parse ignored customers:', error);
      }
    }
  }, []);

  const handleNoteClick = (customerId: string, customerName: string, note: string | null) => {
    setSelectedCustomer({ id: customerId, name: customerName, note });
  };

  const handleCloseModal = () => {
    setSelectedCustomer(null);
  };

  const ignoreCustomer = (customerId: string) => {
    setIgnoredCustomers(prev => {
      const newSet = new Set(prev).add(customerId);
      // Save to sessionStorage
      sessionStorage.setItem('ignoredDiscrepancies', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

  const unignoreCustomer = (customerId: string) => {
    setIgnoredCustomers(prev => {
      const newSet = new Set(prev);
      newSet.delete(customerId);
      // Save to sessionStorage
      sessionStorage.setItem('ignoredDiscrepancies', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

  const visibleDiscrepancies = showIgnored 
    ? discrepancies 
    : discrepancies.filter(item => !ignoredCustomers.has(item.customer_id));
  const ignoredCount = ignoredCustomers.size;

  return (
    <>
      {/* Show Ignored Toggle */}
      {ignoredCount > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Found <span className="font-semibold text-slate-900">{visibleDiscrepancies.length}</span> customer(s) with invoice discrepancies
          </div>
          <button
            onClick={() => setShowIgnored(!showIgnored)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100"
          >
            {showIgnored ? (
              <>
                <EyeSlashIcon className="h-4 w-4" />
                Hide Ignored
              </>
            ) : (
              <>
                <EyeIcon className="h-4 w-4" />
                Show Ignored ({ignoredCount})
              </>
            )}
          </button>
        </div>
      )}

      {visibleDiscrepancies.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-800 font-medium">
            ✓ All recurring invoices match expected amounts!
          </p>
          <p className="text-green-600 text-sm mt-1">
            {ignoredCount > 0 ? `${ignoredCount} row(s) ignored for this session` : 'No discrepancies found.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Expected Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Current Invoice
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Difference
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Note
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {visibleDiscrepancies.map((item) => {
                  const expected = item.expected_amount / 100;
                  const current = item.recurring_invoice_amount ? item.recurring_invoice_amount / 100 : 0;
                  const diff = item.difference ? item.difference / 100 : 0;
                  const isHigher = diff > 0;
                  const isMissing = !item.recurring_invoice_id;
                  const isIgnored = ignoredCustomers.has(item.customer_id);

                  return (
                    <tr 
                      key={item.customer_id} 
                      className={isIgnored ? "bg-slate-50 opacity-60" : "hover:bg-slate-50"}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/billing/${item.customer_id}/edit`}
                            className="text-sm font-medium text-sky-600 hover:text-sky-700"
                          >
                            {item.customer_name}
                          </Link>
                          {isIgnored && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Ignored
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-900">
                          ${expected.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.enrollment_count} enrollment(s), {item.pickup_count} pickup(s)
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isMissing ? (
                          <span className="text-sm text-red-600 font-medium">
                            No Invoice
                          </span>
                        ) : (
                          <div>
                            <div className="text-sm text-slate-900">
                              ${current.toFixed(2)}
                            </div>
                            {item.recurring_invoice_next_date && (
                              <div className="text-xs text-slate-500">
                                Next: {formatDate(item.recurring_invoice_next_date)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isMissing ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Missing
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              isHigher
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {isHigher ? '+' : ''}${diff.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-md">
                        <button
                          onClick={() => handleNoteClick(item.customer_id, item.customer_name, item.recent_note)}
                          className="text-left w-full hover:bg-blue-50 rounded p-2 transition-colors"
                        >
                          {item.recent_note ? (
                            <div className="space-y-0.5">
                              <div className="text-xs text-slate-700 line-clamp-2">
                                {item.recent_note}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {item.note_creator} • {formatDate(item.note_date!)}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <ChatBubbleLeftIcon className="h-4 w-4" />
                              <span>Add note...</span>
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/billing/${item.customer_id}/edit`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-sky-600 bg-white border border-sky-300 rounded hover:bg-sky-50 transition-colors"
                          >
                            Fix
                          </Link>
                          {isIgnored ? (
                            <button
                              onClick={() => unignoreCustomer(item.customer_id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                            >
                              <EyeIcon className="h-3.5 w-3.5" />
                              Unignore
                            </button>
                          ) : (
                            <button
                              onClick={() => ignoreCustomer(item.customer_id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                            >
                              <EyeSlashIcon className="h-3.5 w-3.5" />
                              Ignore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-600">
              Found <span className="font-semibold text-slate-900">{visibleDiscrepancies.length}</span> customer(s) with invoice discrepancies
              {ignoredCount > 0 && (
                <span className="ml-2 text-slate-500">
                  ({ignoredCount} ignored)
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {mounted && selectedCustomer && createPortal(
        <CustomerNotesModal
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          currentUserName={currentUserName}
          onClose={handleCloseModal}
        />,
        document.body
      )}
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChatBubbleLeftIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import CustomerNotesModal from './customer-notes-modal';

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

  const handleIgnore = (customerId: string) => {
    setIgnoredCustomers(prev => {
      const newSet = new Set(prev).add(customerId);
      // Save to sessionStorage
      sessionStorage.setItem('ignoredDiscrepancies', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

  const filteredDiscrepancies = discrepancies.filter(item => !ignoredCustomers.has(item.customer_id));
  const ignoredCount = ignoredCustomers.size;

  return (
    <>
      {filteredDiscrepancies.length === 0 ? (
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
                {filteredDiscrepancies.map((item) => {
                  const expected = item.expected_amount / 100;
                  const current = item.recurring_invoice_amount ? item.recurring_invoice_amount / 100 : 0;
                  const diff = item.difference ? item.difference / 100 : 0;
                  const isHigher = diff > 0;
                  const isMissing = !item.recurring_invoice_id;

                  return (
                    <tr key={item.customer_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/dashboard/billing/${item.customer_id}/edit`}
                          className="text-sm font-medium text-sky-600 hover:text-sky-700"
                        >
                          {item.customer_name}
                        </Link>
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
                                Next: {new Date(item.recurring_invoice_next_date).toLocaleDateString()}
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
                                {item.note_creator} • {new Date(item.note_date!).toLocaleDateString()}
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
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/dashboard/billing/${item.customer_id}/edit`}
                          className="text-sky-600 hover:text-sky-700 mr-3"
                        >
                          Fix
                        </Link>
                        <button
                          onClick={() => handleIgnore(item.customer_id)}
                          className="text-slate-500 hover:text-slate-700"
                          title="Ignore for this session"
                        >
                          <EyeSlashIcon className="h-4 w-4 inline" />
                        </button>
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
              Found <span className="font-semibold text-slate-900">{filteredDiscrepancies.length}</span> customer(s) with invoice discrepancies
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

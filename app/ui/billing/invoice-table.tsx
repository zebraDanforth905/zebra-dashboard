'use client';

import { useState } from 'react';
import { InvoiceTableData } from "@/app/lib/definitions";
import { PencilIcon } from '@heroicons/react/24/outline';
import InvoiceForm from './invoice-form';
import { formatDate } from '@/app/lib/utils';

export default function InvoiceTable({ 
  customerId, 
  initialInvoices 
}: { 
  customerId: string;
  initialInvoices: InvoiceTableData[];
}) {
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  return (
    <div className="mt-6">
      <h2 className="text-lg font-medium text-slate-700 mb-2">Invoices:</h2>
      
      {initialInvoices.length > 0 ? (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                  Description
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {initialInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-900">
                    {formatDate(invoice.date)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-900">
                    ${(invoice.amount / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-900">
                    {invoice.description || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button
                      onClick={() => setEditingInvoiceId(invoice.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded transition-colors"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-slate-500 px-2 py-2">No invoices yet.</div>
      )}

      {/* Edit Form */}
      {editingInvoiceId && (
        <InvoiceForm
          customerId={customerId}
          invoice={initialInvoices.find(inv => inv.id === editingInvoiceId) || null}
          onClose={() => setEditingInvoiceId(null)}
        />
      )}

      {/* Create Form */}
      {!editingInvoiceId && (
        <InvoiceForm customerId={customerId} />
      )}
    </div>
  );
}
'use client';

import { useState } from 'react';
import { PencilIcon, DocumentPlusIcon } from '@heroicons/react/24/outline';
import { skipNextDate, generateInvoiceFromRecurring } from '@/app/lib/actions';
import { RecurringInvoiceListData } from '@/app/lib/definitions';
import { formatDate } from '@/app/lib/utils';
import RecurringInvoiceForm from './recurring-invoice-form';

function formatCurrency(amount: number) {
  return (amount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

type Props = {
  customerId: string;
  initialInvoices: RecurringInvoiceListData[];
};

export default function RecurringInvoiceTable({ customerId, initialInvoices }: Props) {
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const editingInvoice = editingInvoiceId
    ? initialInvoices.find((inv) => inv.id === editingInvoiceId)
    : null;

  if (!initialInvoices.length) {
    return (
      <div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          No recurring invoices yet.
        </div>
        <RecurringInvoiceForm customerId={customerId} />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-700">
              <th className="px-3 py-2 text-left text-xs font-semibold">Description</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Amount</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Every</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Next Date</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {initialInvoices.map((inv) => {
              const dayOfMonthSuffix = 
                inv.day_of_month === 1 ? 'st' :
                inv.day_of_month === 2 ? 'nd' :
                inv.day_of_month === 3 ? 'rd' : 'th';

              return (
                <tr key={inv.id}>
                  <td className="px-3 py-2 text-sm font-medium text-slate-800 truncate">
                    {inv.description || '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    {formatCurrency(inv.amount)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    Every {Math.round(inv.every)} month{inv.every > 1 ? 's' : ''} on{' '}
                    {inv.day_of_month === -1 ? 'last day' : `${Math.round(inv.day_of_month)}${dayOfMonthSuffix}`}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {formatDate(inv.next_date)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <form action={generateInvoiceFromRecurring}>
                        <input name="recurringInvoiceId" value={inv.id} readOnly hidden />
                        <button 
                          className="text-xs text-green-600 hover:text-green-700 underline"
                          title="Generate invoice now"
                        >
                          generate
                        </button>
                      </form>
                      <form action={skipNextDate}>
                        <input name="invoiceId" value={inv.id} readOnly hidden />
                        <input name="nextDate" value={String(inv.next_date)} readOnly hidden />
                        <input name="dayOfMonth" value={inv.day_of_month} readOnly hidden />
                        <input name="every" value={inv.every} readOnly hidden />
                        <button className="text-xs text-sky-600 hover:text-sky-700 underline">
                          skip next
                        </button>
                      </form>
                      <button
                        onClick={() => setEditingInvoiceId(inv.id)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingInvoice ? (
        <RecurringInvoiceForm
          customerId={customerId}
          invoice={{
            id: editingInvoice.id,
            amount: editingInvoice.amount,
            day_of_month: editingInvoice.day_of_month,
            every: editingInvoice.every,
            start_date: editingInvoice.start_date,
            end_after: editingInvoice.end_after,
            description: editingInvoice.description,
          }}
          onClose={() => setEditingInvoiceId(null)}
        />
      ) : (
        <RecurringInvoiceForm customerId={customerId} />
      )}
    </div>
  );
}

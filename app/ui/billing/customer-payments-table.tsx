'use client';

import { useState } from 'react';
import { PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/app/lib/utils';

interface Payment {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  status: string;
  description: string;
}

interface CustomerPaymentsTableProps {
  customerId: string;
  initialPayments: Payment[];
}

export default function CustomerPaymentsTable({ customerId, initialPayments }: CustomerPaymentsTableProps) {
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    date: '',
    status: 'submitted',
    description: '',
  });

  const handleEdit = (payment: Payment) => {
    setEditingId(payment.id);
    setIsCreating(false);
    setFormData({
      amount: (payment.amount / 100).toFixed(2),
      date: payment.date,
      status: payment.status,
      description: payment.description || '',
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      status: 'submitted',
      description: '',
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({
      amount: '',
      date: '',
      status: 'submitted',
      description: '',
    });
  };

  const handleSave = async () => {
    try {
      const amountInCents = Math.round(parseFloat(formData.amount) * 100);
      
      const response = await fetch('/api/payments', {
        method: isCreating ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          customer_id: customerId,
          amount: amountInCents,
          date: formData.date,
          status: formData.status,
          description: formData.description,
        }),
      });

      if (response.ok) {
        const updatedPayment = await response.json();
        if (isCreating) {
          setPayments([updatedPayment, ...payments]);
        } else {
          setPayments(payments.map(p => p.id === editingId ? updatedPayment : p));
        }
        handleCancel();
      }
    } catch (error) {
      console.error('Error saving payment:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment?')) return;
    
    try {
      const response = await fetch(`/api/payments?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setPayments(payments.filter(p => p.id !== id));
      }
    } catch (error) {
      console.error('Error deleting payment:', error);
    }
  };

  return (
    <div className="space-y-3">
      {!isCreating && !editingId && (
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Payment
        </button>
      )}

      {(isCreating || editingId) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {isCreating ? 'New Payment' : 'Edit Payment'}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="submitted">Submitted</option>
                <option value="scheduled">Scheduled</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded hover:bg-sky-700 transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Date</th>
              <th className="px-2 py-1.5 text-right font-medium text-slate-600">Amount</th>
              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Status</th>
              <th className="px-2 py-1.5 text-left font-medium text-slate-600">Description</th>
              <th className="px-2 py-1.5 text-right font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-slate-500">
                  No payments found
                </td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-slate-50">
                  <td className="px-2 py-1.5 text-slate-700">{formatDate(payment.date)}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-slate-900">
                    ${(payment.amount / 100).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${
                      payment.status === 'submitted'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : payment.status === 'scheduled'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                    }`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600 max-w-xs truncate">
                    {payment.description || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleEdit(payment)}
                        className="p-1 text-sky-600 hover:bg-sky-50 rounded transition-colors"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(payment.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { PlusIcon, PencilIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createInvoice, updateInvoice, deleteInvoice } from '@/app/lib/actions';

type InvoiceData = {
  id: string;
  amount: number;
  date: string | Date;
  description: string;
};

type Props = {
  customerId: string;
  invoice?: InvoiceData | null;
  onClose?: () => void;
};

export default function InvoiceForm({ customerId, invoice, onClose }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isEditMode = !!invoice;
  const today = new Date().toISOString().split('T')[0];

  // Convert date to string format for input
  const getDateString = (date: string | Date) => {
    if (typeof date === 'string') {
      return date.split('T')[0];
    }
    return new Date(date).toISOString().split('T')[0];
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      
      if (isEditMode) {
        await updateInvoice(formData);
      } else {
        await createInvoice(formData);
      }
      
      // Close form and reset
      setIsOpen(false);
      if (onClose) onClose();
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Failed to save invoice. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!invoice || !confirm('Are you sure you want to delete this invoice?')) return;

    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append('id', invoice.id);
      await deleteInvoice(formData);
      
      setIsOpen(false);
      if (onClose) onClose();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Failed to delete invoice. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  function handleClose() {
    setIsOpen(false);
    if (onClose) onClose();
  }

  // For edit mode, always show the form
  if (isEditMode) {
    return (
      <div className="bg-white border border-slate-300 rounded-lg shadow-lg p-3 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Edit Invoice</h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <input type="hidden" name="id" value={invoice.id} />
          <input type="hidden" name="customer_id" value={customerId} />

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Amount ($) *
            </label>
            <input
              type="number"
              name="amount"
              step="0.01"
              min="0"
              required
              defaultValue={invoice.amount / 100}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Date *
            </label>
            <input
              type="date"
              name="date"
              required
              defaultValue={getDateString(invoice.date)}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Description
            </label>
            <input
              type="text"
              name="description"
              defaultValue={invoice.description}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="Optional description"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSubmitting}
              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting || isDeleting}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // For create mode, show button or form
  return (
    <div className="mt-2">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 transition-colors"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New Invoice
        </button>
      ) : (
        <div className="bg-white border border-slate-300 rounded-lg shadow-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">New Invoice</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <input type="hidden" name="customer_id" value={customerId} />

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount ($) *
              </label>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0"
                required
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                name="date"
                required
                defaultValue={today}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Description
              </label>
              <input
                type="text"
                name="description"
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Optional description"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Invoice'}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

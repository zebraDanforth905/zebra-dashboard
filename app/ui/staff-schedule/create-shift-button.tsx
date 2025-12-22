'use client';

import { useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createShift } from '@/app/lib/actions';

export default function CreateShiftButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      await createShift(formData);
      setIsOpen(false);
      window.location.reload();
    } catch (err) {
      setError('Failed to create shift');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition"
      >
        <PlusIcon className="h-5 w-5" />
        New Event
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Create Special Event/Shift</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                  Event Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  placeholder="e.g., Birthday Party - Ava"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label htmlFor="event_type" className="block text-sm font-medium text-slate-700 mb-1">
                  Event Type <span className="text-red-600">*</span>
                </label>
                <select
                  id="event_type"
                  name="event_type"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="birthday">Birthday Party</option>
                  <option value="workshop">Workshop</option>
                  <option value="special">Special Event</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-slate-700 mb-1">
                    Start Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    id="start_date"
                    name="start_date"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label htmlFor="start_time" className="block text-sm font-medium text-slate-700 mb-1">
                    Start Time <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="time"
                    id="start_time"
                    name="start_time"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="end_date" className="block text-sm font-medium text-slate-700 mb-1">
                    End Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    id="end_date"
                    name="end_date"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label htmlFor="end_time" className="block text-sm font-medium text-slate-700 mb-1">
                    End Time <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="time"
                    id="end_time"
                    name="end_time"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Additional details..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

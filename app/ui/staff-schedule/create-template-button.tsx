'use client';

import { useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createShiftTemplate } from '@/app/lib/actions';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CreateTemplateButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      await createShiftTemplate(formData);
      setIsOpen(false);
      window.location.reload();
    } catch (err) {
      setError('Failed to create template');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 transition"
      >
        <PlusIcon className="h-5 w-5" />
        New Template
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Create Shift Template</h2>
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
                  Template Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  placeholder="e.g., Jackman - Monday 4-5"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label htmlFor="weekday" className="block text-sm font-medium text-slate-700 mb-1">
                  Weekday <span className="text-red-600">*</span>
                </label>
                <select
                  id="weekday"
                  name="weekday"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select a day</option>
                  {WEEKDAYS.map((day, idx) => (
                    <option key={idx} value={idx}>{day}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="start_time" className="block text-sm font-medium text-slate-700 mb-1">
                    Start Time <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="time"
                    id="start_time"
                    name="start_time"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="shift_type" className="block text-sm font-medium text-slate-700 mb-1">
                  Shift Type <span className="text-red-600">*</span>
                </label>
                <select
                  id="shift_type"
                  name="shift_type"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="class">Class</option>
                  <option value="admin">Admin</option>
                  <option value="support">Support</option>
                </select>
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
                  className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50"
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

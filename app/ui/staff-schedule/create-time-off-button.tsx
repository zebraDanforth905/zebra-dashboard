'use client';

import { useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createTimeOff } from '@/app/lib/actions';

type Props = {
  staffUsers: Array<{ id: string; name: string; email: string }>;
};

export default function CreateTimeOffButton({ staffUsers }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      await createTimeOff(formData);
      setIsOpen(false);
      window.location.reload();
    } catch (err) {
      setError('Failed to create time off request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition"
      >
        <PlusIcon className="h-5 w-5" />
        Request Time Off
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Request Time Off</h2>
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
                <label htmlFor="staff_user_id" className="block text-sm font-medium text-slate-700 mb-1">
                  Staff Member <span className="text-red-600">*</span>
                </label>
                <select
                  id="staff_user_id"
                  name="staff_user_id"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select staff member</option>
                  {staffUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="time_off_type" className="block text-sm font-medium text-slate-700 mb-1">
                  Type <span className="text-red-600">*</span>
                </label>
                <select
                  id="time_off_type"
                  name="time_off_type"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick Leave</option>
                  <option value="other">Other</option>
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                    defaultValue="09:00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                    defaultValue="17:00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">
                  Status <span className="text-red-600">*</span>
                </label>
                <select
                  id="status"
                  name="status"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="requested">Requested</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                </select>
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Reason for time off..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

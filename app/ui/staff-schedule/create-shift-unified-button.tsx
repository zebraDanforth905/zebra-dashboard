'use client';

import { useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createShiftUnified } from '@/app/lib/actions';

type Props = {
  staffUsers: Array<{ id: string; name: string; email: string }>;
};

export default function CreateShiftUnifiedButton({ staffUsers }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shiftType, setShiftType] = useState<'recurring' | 'one-off'>('recurring');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      formData.append('shift_type', shiftType);
      await createShiftUnified(formData);
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
        className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 transition"
      >
        <PlusIcon className="h-5 w-5" />
        Shift
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Create New Shift</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Shift Type Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Shift Type <span className="text-red-600">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={shiftType === 'recurring'}
                      onChange={() => setShiftType('recurring')}
                      className="mr-2 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-sm">Recurring Template</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={shiftType === 'one-off'}
                      onChange={() => setShiftType('one-off')}
                      className="mr-2 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-sm">One-Off Event</span>
                  </label>
                </div>
              </div>

              {/* Shift Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                  Shift Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g., Morning Class, Birthday Party"
                />
              </div>

              {shiftType === 'recurring' ? (
                <>
                  {/* Weekday */}
                  <div>
                    <label htmlFor="weekday" className="block text-sm font-medium text-slate-700 mb-1">
                      Day of Week <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="weekday"
                      name="weekday"
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="">Select a day</option>
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                    </select>
                  </div>

                  {/* Time Range */}
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

                  {/* Shift Type for Template */}
                  <div>
                    <label htmlFor="shift_category" className="block text-sm font-medium text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      id="shift_category"
                      name="shift_category"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="class">Class</option>
                      <option value="admin">Admin</option>
                      <option value="support">Support</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  {/* Event Type */}
                  <div>
                    <label htmlFor="event_type" className="block text-sm font-medium text-slate-700 mb-1">
                      Event Type
                    </label>
                    <select
                      id="event_type"
                      name="event_type"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="special">Special Event</option>
                      <option value="workshop">Workshop</option>
                      <option value="birthday">Birthday Party</option>
                    </select>
                  </div>

                  {/* Date and Time */}
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="start_time_oneoff" className="block text-sm font-medium text-slate-700 mb-1">
                        Start Time <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="time"
                        id="start_time_oneoff"
                        name="start_time_oneoff"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="end_time_oneoff" className="block text-sm font-medium text-slate-700 mb-1">
                        End Time <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="time"
                        id="end_time_oneoff"
                        name="end_time_oneoff"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="Additional details..."
                    />
                  </div>
                </>
              )}

              {/* Optional Date Range for Templates */}
              {shiftType === 'recurring' && (
                <div className="border-t border-slate-200 pt-4">
                  <div className="mb-2 text-sm font-medium text-slate-700">
                    Optional: Limit this template to specific dates
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="effective_from" className="block text-sm font-medium text-slate-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        id="effective_from"
                        name="effective_from"
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="effective_to" className="block text-sm font-medium text-slate-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        id="effective_to"
                        name="effective_to"
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Staff Assignment */}
              <div className="border-t border-slate-200 pt-4">
                <div className="mb-2 text-sm font-medium text-slate-700">
                  Optional: Assign Staff Member
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="staff_user_id" className="block text-sm font-medium text-slate-700 mb-1">
                      Staff Member
                    </label>
                    <select
                      id="staff_user_id"
                      name="staff_user_id"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="">No assignment</option>
                      {staffUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="role" className="block text-sm font-medium text-slate-700 mb-1">
                      Role
                    </label>
                    <select
                      id="role"
                      name="role"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="">No specific role</option>
                      <option value="instructor">Instructor</option>
                      <option value="assistant">Assistant</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
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
                  {isSubmitting ? 'Creating...' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

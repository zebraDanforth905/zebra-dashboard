'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createAssignment } from '@/app/lib/actions';
import { ShiftTemplate } from '@/app/lib/staff-schedule-types';

type Props = {
  templates: ShiftTemplate[];
  staffUsers: Array<{ id: string; name: string; email: string }>;
};

export default function CreateAssignmentButton({ templates, staffUsers }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [assignmentType, setAssignmentType] = useState<'template' | 'shift'>('template');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      formData.append('assignment_type', assignmentType);
      await createAssignment(formData);
      setIsOpen(false);
      window.location.reload();
    } catch (err) {
      setError('Failed to create assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
      >
        <PlusIcon className="h-5 w-5" />
        Assign Staff
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Assign Staff to Shift</h2>
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
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Assignment Type <span className="text-red-600">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="assignment_type_radio"
                      value="template"
                      checked={assignmentType === 'template'}
                      onChange={() => setAssignmentType('template')}
                      className="mr-2"
                    />
                    <span className="text-sm">Recurring Template</span>
                  </label>
                </div>
              </div>

              {assignmentType === 'template' && (
                <div>
                  <label htmlFor="template_id" className="block text-sm font-medium text-slate-700 mb-1">
                    Shift Template <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="template_id"
                    name="template_id"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select a template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="staff_user_id" className="block text-sm font-medium text-slate-700 mb-1">
                  Staff Member <span className="text-red-600">*</span>
                </label>
                <select
                  id="staff_user_id"
                  name="staff_user_id"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
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
                <label htmlFor="role" className="block text-sm font-medium text-slate-700 mb-1">
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">No specific role</option>
                  <option value="instructor">Instructor</option>
                  <option value="assistant">Assistant</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="effective_from" className="block text-sm font-medium text-slate-700 mb-1">
                    Effective From
                  </label>
                  <input
                    type="date"
                    id="effective_from"
                    name="effective_from"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label htmlFor="effective_to" className="block text-sm font-medium text-slate-700 mb-1">
                    Effective To
                  </label>
                  <input
                    type="date"
                    id="effective_to"
                    name="effective_to"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
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
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createIncidentReport } from '@/app/lib/actions';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

function SubmitButton() {
  const { pending } = useFormStatus();
  
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
    >
      {pending ? 'Submitting...' : 'Submit Report'}
    </button>
  );
}

export default function IncidentReportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(createIncidentReport, null);

  // Close modal and reset on success
  if (state?.ok && isOpen) {
    setTimeout(() => {
      setIsOpen(false);
    }, 1500);
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-red-600 text-white p-4 rounded-full shadow-lg hover:bg-red-700 transition-all hover:scale-110 z-40 print:hidden"
        title="Report an Incident"
      >
        <ExclamationTriangleIcon className="h-6 w-6" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                <h2 className="text-xl font-bold text-slate-900">Report an Incident</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Form */}
            <form action={formAction} className="p-4">
              <div className="mb-4">
                <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
                  Description <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={6}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  placeholder="Please describe the incident in detail..."
                />
                <p className="text-xs text-slate-500 mt-1">
                  Minimum 10 characters required
                </p>
              </div>

              {/* Error Message */}
              {state?.error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{state.error}</p>
                </div>
              )}

              {/* Success Message */}
              {state?.ok && state?.message && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">{state.message}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <div className="flex-1">
                  <SubmitButton />
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

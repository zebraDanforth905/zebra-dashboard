'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createIncidentReport } from '@/app/lib/actions';
import { ExclamationTriangleIcon, XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

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
  const [otherStudents, setOtherStudents] = useState<string[]>(['']);
  const [coaches, setCoaches] = useState<string[]>(['']);

  // Close modal and reset on success
  if (state?.ok && isOpen) {
    setTimeout(() => {
      setIsOpen(false);
      setOtherStudents(['']);
      setCoaches(['']);
    }, 1500);
  }

  const addOtherStudent = () => {
    setOtherStudents([...otherStudents, '']);
  };

  const removeOtherStudent = (index: number) => {
    setOtherStudents(otherStudents.filter((_, i) => i !== index));
  };

  const addCoach = () => {
    setCoaches([...coaches, '']);
  };

  const removeCoach = (index: number) => {
    setCoaches(coaches.filter((_, i) => i !== index));
  };

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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white rounded-t-lg flex-shrink-0">
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
            <form action={formAction} className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="incident_date" className="block text-sm font-medium text-slate-700 mb-2">
                    Date of Incident <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    id="incident_date"
                    name="incident_date"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="incident_time" className="block text-sm font-medium text-slate-700 mb-2">
                    Time of Incident <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="time"
                    id="incident_time"
                    name="incident_time"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Student Involved */}
              <div>
                <label htmlFor="student_name" className="block text-sm font-medium text-slate-700 mb-2">
                  Student Involved <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  id="student_name"
                  name="student_name"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter student name"
                />
              </div>

              {/* Coaches Involved */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Coach(es) Involved <span className="text-red-600">*</span>
                </label>
                <div className="space-y-2">
                  {coaches.map((_, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        name={`coach_${index}`}
                        required={index === 0}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Enter coach name"
                      />
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeCoach(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addCoach}
                    className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 font-medium"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Another Coach
                  </button>
                </div>
              </div>

              {/* What Happened */}
              <div>
                <label htmlFor="what_happened" className="block text-sm font-medium text-slate-700 mb-2">
                  What Happened <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="what_happened"
                  name="what_happened"
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  placeholder="Describe what happened during the incident"
                />
              </div>

              {/* What Led Up */}
              <div>
                <label htmlFor="what_led_up" className="block text-sm font-medium text-slate-700 mb-2">
                  What Led Up to the Incident <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="what_led_up"
                  name="what_led_up"
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  placeholder="Describe the events leading up to the incident"
                />
              </div>

              {/* Other Students Involved */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Other Student(s) Involved
                </label>
                <div className="space-y-2">
                  {otherStudents.map((_, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        name={`other_student_${index}`}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Enter student name (optional)"
                      />
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeOtherStudent(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addOtherStudent}
                    className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 font-medium"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Another Student
                  </button>
                </div>
              </div>

              {/* Parent Involvement */}
              <div>
                <label htmlFor="parent_involvement" className="block text-sm font-medium text-slate-700 mb-2">
                  Parent Involvement/Awareness <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="parent_involvement"
                  name="parent_involvement"
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  placeholder="Describe if/how parents were involved or made aware, and summary of any conversations"
                />
              </div>

              {/* How Addressed */}
              <div>
                <label htmlFor="how_addressed" className="block text-sm font-medium text-slate-700 mb-2">
                  How Was It Addressed <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="how_addressed"
                  name="how_addressed"
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  placeholder="Describe how the situation was addressed with the student by the coach or staff"
                />
              </div>

              {/* Error Message */}
              {state?.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{state.error}</p>
                </div>
              )}

              {/* Success Message */}
              {state?.ok && state?.message && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">{state.message}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
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

'use client';

import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { markPickupAbsence, unmarkPickupAbsence } from '@/app/lib/actions';

type Props = {
  pickupId: string;
  studentName: string;
  weekday: string;
  isCurrentlyAbsent: boolean;
  currentDate: Date;
  onClose: () => void;
  onSuccess: () => void;
};

export default function MarkAbsenceModal({
  pickupId,
  studentName,
  weekday,
  isCurrentlyAbsent,
  currentDate,
  onClose,
  onSuccess
}: Props) {
  const [selectedDate, setSelectedDate] = useState(
    currentDate.toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const date = new Date(selectedDate);
      
      if (isCurrentlyAbsent) {
        await unmarkPickupAbsence(pickupId, date);
      } else {
        await markPickupAbsence(pickupId, date);
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      alert('Failed to update absence. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {isCurrentlyAbsent ? 'Unmark Absence' : 'Mark Absence'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
            disabled={isSubmitting}
          >
            <XMarkIcon className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Student: <span className="font-medium text-gray-900">{studentName}</span>
          </p>
          <p className="text-sm text-gray-600">
            Pickup Day: <span className="font-medium text-gray-900">{weekday}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="absenceDate" className="block text-sm font-medium text-gray-700 mb-2">
              Select Date <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              id="absenceDate"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              disabled={isSubmitting}
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Choose the date when the student will be/was absent for pickup
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                isCurrentlyAbsent
                  ? 'bg-sky-600 hover:bg-sky-700 focus:ring-sky-500'
                  : 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500'
              }`}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Processing...'
                : isCurrentlyAbsent
                ? 'Remove Absence'
                : 'Mark Absent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

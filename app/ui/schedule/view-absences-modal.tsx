'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { fetchPickupAbsencesForStudent } from '@/app/lib/data';
import { unmarkPickupAbsence } from '@/app/lib/actions';
import { formatDate } from '@/app/lib/utils';

type Absence = {
  id: string;
  pickup_id: string;
  date: Date;
  weekday: string;
  school_name: string;
};

type Props = {
  studentId: string;
  onClose: () => void;
};

function capitalizeSchoolName(schoolName: string): string {
  return schoolName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default function ViewAbsencesModal({ studentId, onClose }: Props) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAbsences = async () => {
      try {
        const data = await fetchPickupAbsencesForStudent(studentId);
        setAbsences(data);
      } catch (error) {
        console.error('Failed to load absences:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAbsences();
  }, [studentId]);

  const handleRemoveAbsence = async (pickupId: string, date: Date) => {
   
      try {
        await unmarkPickupAbsence(pickupId, date);
        setAbsences(absences.filter(a => !(a.pickup_id === pickupId && a.date === date)));
      } catch (error) {
        alert('Failed to remove absence');
      }
    
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between sticky top-0 bg-white pb-2 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Pickup Absences</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
          >
            <XMarkIcon className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : absences.length === 0 ? (
          <div className="py-8 text-center text-gray-500">No absences recorded for this student.</div>
        ) : (
          <div className="space-y-2">
            {absences.map((absence) => (
              <div
                key={absence.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {formatDate(new Date(absence.date))}
                  </div>
                  <div className="text-sm text-gray-600">
                    {capitalizeSchoolName(absence.school_name)} - {absence.weekday.charAt(0).toUpperCase() + absence.weekday.slice(1)} pickup
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveAbsence(absence.pickup_id, absence.date)}
                  className="ml-4 p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                  title="Remove absence"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

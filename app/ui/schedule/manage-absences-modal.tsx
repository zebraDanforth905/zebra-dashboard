'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { fetchPickupAbsencesForStudent } from '@/app/lib/data';
import { markPickupAbsence, unmarkPickupAbsence } from '@/app/lib/actions';

type Absence = {
  id: string;
  pickup_id: string;
  date: Date;
  weekday: string;
  school_name: string;
};

type Props = {
  pickupId: string;
  studentId: string;
  studentName: string;
  onClose: () => void;
};

export default function ManageAbsencesModal({ pickupId, studentId, studentName, onClose }: Props) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    loadAbsences();
  }, [studentId]);

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

  const isAbsent = (date: Date): boolean => {
    const dateStr = date.toISOString().split('T')[0];
    return absences.some(a => {
      const absenceDate = new Date(a.date).toISOString().split('T')[0];
      return absenceDate === dateStr;
    });
  };

  const toggleAbsence = async (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    setToggling(dateStr);

    try {
      if (isAbsent(date)) {
        await unmarkPickupAbsence(pickupId, date);
        setAbsences(absences.filter(a => {
          const absenceDate = new Date(a.date).toISOString().split('T')[0];
          return absenceDate !== dateStr;
        }));
      } else {
        await markPickupAbsence(pickupId, date);
        // Reload to get the new absence with full data
        await loadAbsences();
      }
    } catch (error) {
      alert('Failed to update absence');
    } finally {
      setToggling(null);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const renderCalendar = () => {
    const days = [];
    
    // Empty cells for days before the month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(
        <div key={`empty-${i}`} className="aspect-square" />
      );
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      const absent = isAbsent(date);
      const isTogglingThis = toggling === dateStr;
      const isToday = new Date().toDateString() === date.toDateString();

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => toggleAbsence(date)}
          disabled={isTogglingThis}
          className={`
            aspect-square p-1 rounded text-xs font-medium transition-all
            ${absent
              ? 'bg-rose-500 text-white hover:bg-rose-600'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }
            ${isToday && !absent ? 'ring-2 ring-blue-500' : ''}
            ${isTogglingThis ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
            disabled:opacity-50
          `}
          title={absent ? 'Click to remove absence' : 'Click to mark absent'}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-md rounded-lg bg-white p-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Manage Absences</h2>
            <p className="text-xs text-gray-600 mt-0.5">{studentName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-500">Loading...</div>
        ) : (
          <>
            {/* Calendar Header */}
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={goToPreviousMonth}
                className="p-1.5 hover:bg-gray-100 rounded-full"
              >
                <ChevronLeftIcon className="h-4 w-4 text-gray-600" />
              </button>
              <h3 className="text-sm font-semibold text-gray-900">
                {monthNames[month]} {year}
              </h3>
              <button
                onClick={goToNextMonth}
                className="p-1.5 hover:bg-gray-100 rounded-full"
              >
                <ChevronRightIcon className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayNames.map(name => (
                <div key={name} className="text-center text-[10px] font-semibold text-gray-600 py-1">
                  {name}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 mb-3">
              {renderCalendar()}
            </div>

            {/* Legend */}
            <div className="border-t pt-3">
              <div className="flex gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-rose-500 rounded"></div>
                  <span className="text-gray-600">Absent</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-white rounded border border-gray-200"></div>
                  <span className="text-gray-600">Present</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-white rounded border-2 border-blue-500"></div>
                  <span className="text-gray-600">Today</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                Click any day to toggle
              </p>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

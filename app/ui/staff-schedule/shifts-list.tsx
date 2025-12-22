'use client';

import { Shift } from '@/app/lib/staff-schedule-types';

type Props = {
  shifts: Shift[];
};

export default function ShiftsList({ shifts }: Props) {
  if (shifts.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No upcoming special shifts</p>
      </div>
    );
  }

  const formatDateTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-3">
      {shifts.map((shift) => (
        <div
          key={shift.id}
          className="border border-slate-200 rounded-lg p-4 hover:border-sky-300 transition"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="font-medium text-slate-900">{shift.name}</div>
              <div className="text-sm text-slate-600 mt-1">
                {formatDateTime(shift.starts_at)} - {formatDateTime(shift.ends_at)}
              </div>
              <div className="mt-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  shift.event_type === 'birthday' 
                    ? 'bg-pink-100 text-pink-800'
                    : shift.event_type === 'workshop'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {shift.event_type}
                </span>
              </div>
              {shift.notes && (
                <div className="text-sm text-slate-500 mt-2 italic">
                  {shift.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

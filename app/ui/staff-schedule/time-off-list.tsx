'use client';

import { StaffTimeOff } from '@/app/lib/staff-schedule-types';

type Props = {
  timeOff: StaffTimeOff[];
};

export default function TimeOffList({ timeOff }: Props) {
  if (timeOff.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No upcoming time off</p>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'requested':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'vacation':
        return 'bg-blue-100 text-blue-800';
      case 'sick':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Staff Member
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Start Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              End Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Notes
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {timeOff.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                {item.staff_name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                {formatDate(item.starts_at)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                {formatDate(item.ends_at)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(item.time_off_type)}`}>
                  {item.time_off_type}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(item.status)}`}>
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                {item.notes || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

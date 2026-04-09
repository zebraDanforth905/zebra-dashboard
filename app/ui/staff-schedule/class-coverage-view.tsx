import { StaffScheduleClassBlock, StaffSchedulePickupCoverageRow } from '@/app/lib/staff-schedule-types';

type ClassCoverageViewProps = {
  blocks: StaffScheduleClassBlock[];
  pickupCoverageRows: StaffSchedulePickupCoverageRow[];
};

function formatDisplayTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = minuteText ?? '00';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function formatTimeRange(start: string, end: string) {
  return `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`;
}

export function ClassCoverageView({ blocks, pickupCoverageRows }: ClassCoverageViewProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Class Block Coverage</h2>
        <p className="mt-1 text-sm text-gray-600">
          Staff absences are automatically factored in—coaches marked absent for a time block will not be counted toward capacity.
          Load shows sum of student loads, and coach capacity shows sum of available coaches present during the block.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Time Block</th>
                <th className="px-2 py-2">Student Load</th>
                <th className="px-2 py-2">Coach Capacity</th>
                <th className="px-2 py-2">Bonus/Deficit</th>
                <th className="px-2 py-2">Qualification Warnings</th>
                <th className="px-2 py-2">Staff Present</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, idx) => (
                <tr key={`${b.date}-${b.start_time}-${idx}`} className="border-b border-gray-100 align-top">
                  <td className="px-2 py-2 text-gray-800">
                    {b.weekday}
                    <div className="text-xs text-gray-500">{b.date}</div>
                  </td>
                  <td className="px-2 py-2 text-gray-800">
                    {formatTimeRange(b.start_time, b.end_time)}
                  </td>
                  <td className="px-2 py-2 font-medium text-gray-900">{b.total_load}</td>
                  <td className="px-2 py-2 font-medium text-gray-900">{b.total_coach_capacity}</td>
                  <td
                    className={`px-2 py-2 font-semibold ${
                      b.capacity_delta >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {b.capacity_delta >= 0 ? `+${b.capacity_delta}` : b.capacity_delta}
                  </td>
                  <td className="px-2 py-2 text-gray-700">
                    {b.qualification_warnings.length === 0 ? (
                      <span className="text-emerald-700">None</span>
                    ) : (
                      <ul className="space-y-1">
                        {b.qualification_warnings.map((warning) => (
                          <li key={warning} className="font-medium text-amber-700">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-2 py-2 text-gray-700">
                    {b.staff_present.length === 0 ? (
                      <span className="text-gray-400">None</span>
                    ) : (
                      <ul className="space-y-1">
                        {b.staff_present.map((staff) => (
                          <li key={`${staff.user_id}-${staff.start_time}-${staff.end_time}`}>
                            {staff.user_name} (cap {staff.coach_capacity}) {formatTimeRange(staff.start_time, staff.end_time)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Pickup Coverage</h2>
        <p className="mt-1 text-sm text-gray-600">
          Daily pickup demand by school, with assigned pickup coaches.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">School</th>
                <th className="px-2 py-2">Pickup Students</th>
                <th className="px-2 py-2">Assigned Coaches</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {pickupCoverageRows.map((row) => (
                <tr key={`${row.date}-${row.school_name}`} className="border-b border-gray-100 align-top">
                  <td className="px-2 py-2 text-gray-800">
                    {row.weekday}
                    <div className="text-xs text-gray-500">{row.date}</div>
                  </td>
                  <td className="px-2 py-2 text-gray-800">{row.school_name}</td>
                  <td className="px-2 py-2 font-medium text-gray-900">{row.pickup_count}</td>
                  <td className="px-2 py-2 text-gray-700">
                    {row.assigned_coaches.length === 0 ? (
                      <span className="text-gray-400">None</span>
                    ) : (
                      row.assigned_coaches.join(', ')
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {row.has_coverage ? (
                      <span className="font-medium text-emerald-700">Covered</span>
                    ) : (
                      <span className="font-medium text-red-700">Missing Pickup Coach</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

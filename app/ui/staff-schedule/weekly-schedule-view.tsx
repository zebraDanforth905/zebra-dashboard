import {
  assignStaffToTemplateShift,
  createUntemplatedShift,
} from '@/app/lib/actions';
import {
  StaffScheduleAbsence,
  StaffScheduleOpenShift,
  StaffScheduleUser,
  StaffScheduleWeeklyDay,
} from '@/app/lib/staff-schedule-types';
import { formatDate } from '@/app/lib/utils';

const SHIFT_TYPE_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'coach', label: 'Coach' },
  { value: 'pickup_frankland', label: 'Pickup (Frankland)' },
  { value: 'pickup_jackman', label: 'Pickup (Jackman)' },
];

type WeeklyScheduleViewProps = {
  weekStart: string;
  weekEnd: string;
  days: StaffScheduleWeeklyDay[];
  users: StaffScheduleUser[];
  absences: StaffScheduleAbsence[];
  openShifts: StaffScheduleOpenShift[];
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

function shiftTypeLabel(type: string) {
  if (type === 'pickup_frankland') return 'Frankland';
  if (type === 'pickup_jackman') return 'Jackman';
  return type;
}

export function WeeklyScheduleView({
  weekStart,
  weekEnd,
  days,
  users,
  absences,
  openShifts,
}: WeeklyScheduleViewProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Weekly Staff Schedule</h2>
            <p className="mt-1 text-sm text-gray-600">
              {formatDate(weekStart)} to {formatDate(weekEnd)}. Shifts are trimmed around absences, and each day cell supports quick shift entry.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1180px] table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-44 border border-gray-200 bg-gray-50 px-3 py-3 text-left font-semibold text-gray-900">
                  Staff
                </th>
                {days.map((day) => (
                  <th key={day.date} className="w-40 border border-gray-200 bg-gray-50 px-3 py-3 text-left align-top">
                    <div className="font-semibold text-gray-900">{day.weekday}</div>
                    <div className="text-xs font-medium text-gray-500">{formatDate(day.date)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="sticky left-0 z-10 border border-gray-200 bg-white px-3 py-3 align-top">
                    <div className="font-semibold text-gray-900">{user.name}</div>
                    <div className="text-xs text-gray-500">cap {user.coach_capacity}</div>
                  </td>
                  {days.map((day) => {
                    const shifts = day.shifts.filter((shift) => shift.user_id === user.id);
                    const flags = day.absence_flags.filter((flag) => flag.user_id === user.id);
                    const hasContent = shifts.length > 0 || flags.length > 0;

                    return (
                      <td
                        key={`${user.id}-${day.date}`}
                        className={`border border-gray-200 px-2 py-2 align-top ${
                          hasContent ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <div className="space-y-2">
                          {flags.map((flag) => (
                            <div key={`${flag.absence_id}-${user.id}`} className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
                              <div className="font-semibold">Absent</div>
                              <div>{flag.ranges.map((range) => formatTimeRange(range.start_time, range.end_time)).join(', ')}</div>
                            </div>
                          ))}

                          {shifts.map((shift, idx) => (
                            <div key={`${shift.user_id}-${shift.date}-${shift.start_time}-${idx}`} className="rounded bg-yellow-100 px-2 py-2 shadow-sm ring-1 ring-yellow-200">
                              <div className="font-semibold text-gray-900">{formatTimeRange(shift.start_time, shift.end_time)}</div>
                              <div className="mt-1 text-[11px] text-gray-600">
                                {shift.source}
                                {shift.template_name ? ` • ${shift.template_name}` : ''}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {shift.shift_types.map((type) => (
                                  <span key={`${shift.user_id}-${shift.date}-${type}`} className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-200">
                                    {shiftTypeLabel(type)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}

                          <details>
                            <summary className="inline-flex cursor-pointer items-center rounded border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900">
                              + Add shift
                            </summary>
                            <form action={createUntemplatedShift} className="mt-2 space-y-2 rounded border border-gray-200 bg-gray-50 p-2">
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="date" value={day.date} />
                              <div className="grid grid-cols-2 gap-2">
                                <input name="startTime" type="time" step={900} className="rounded border border-gray-300 px-2 py-1 text-xs" required />
                                <input name="endTime" type="time" step={900} className="rounded border border-gray-300 px-2 py-1 text-xs" required />
                              </div>
                              <div className="grid grid-cols-1 gap-1 text-xs text-gray-700">
                                {SHIFT_TYPE_OPTIONS.map((opt) => (
                                  <label key={`${user.id}-${day.date}-${opt.value}`} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1">
                                    <input
                                      type="checkbox"
                                      name="shiftTypes"
                                      value={opt.value}
                                      defaultChecked={opt.value === 'coach'}
                                      className="h-3.5 w-3.5 rounded border-gray-300"
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                              <button className="w-full rounded bg-gray-900 px-2 py-1.5 text-xs font-medium text-white">Save</button>
                            </form>
                          </details>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="font-semibold text-gray-900">Open Weekly Shifts</h3>
          <p className="mt-1 text-xs text-gray-600">Shows template shifts in the selected week that currently have no assigned staff.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {openShifts.map((s) => (
              <li key={`${s.id}-${s.date}`} className="rounded border border-gray-200 p-2">
                <div className="font-medium text-gray-900">{s.template_name || 'Template shift'}</div>
                <div className="text-gray-700">
                  {s.weekday} {formatDate(s.date)} {formatTimeRange(s.start_time, s.end_time)}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.shift_types.map((type) => (
                    <span key={`${s.id}-${type}`} className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      {shiftTypeLabel(type)}
                    </span>
                  ))}
                </div>
                <form action={assignStaffToTemplateShift} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="templateShiftId" value={String(s.id)} />
                  <select name="userId" className="rounded border border-gray-300 px-2 py-1 text-xs" required>
                    <option value="">Assign staff</option>
                    {users.map((u) => (
                      <option key={`${s.id}-${s.date}-${u.id}`} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white">Assign</button>
                </form>
              </li>
            ))}
            {openShifts.length === 0 && <li className="text-sm text-gray-500">No open weekly shifts.</li>}
          </ul>
        </div>

      </section>
    </div>
  );
}

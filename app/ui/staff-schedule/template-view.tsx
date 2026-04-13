import {
  createShiftTemplate,
  createTemplateDateRange,
  createTemplateShiftWithStaff,
  deleteShiftTemplate,
  deleteTemplateDateRange,
  deleteTemplateShift,
  unassignStaffFromTemplateShift,
  updateTemplateShift,
} from '@/app/lib/actions';
import {
  STAFF_SCHEDULE_WEEKDAYS,
  StaffScheduleTemplateViewData,
  StaffScheduleUser,
} from '@/app/lib/staff-schedule-types';
import { formatDate } from '@/app/lib/utils';

const SHIFT_TYPE_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'coach', label: 'Coach' },
  { value: 'pickup_frankland', label: 'Pickup (Frankland)' },
  { value: 'pickup_jackman', label: 'Pickup (Jackman)' },
];

type TemplateViewProps = {
  templateData: StaffScheduleTemplateViewData;
  users: StaffScheduleUser[];
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

export function TemplateView({ templateData, users }: TemplateViewProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Create Template</h2>
        <form action={createShiftTemplate} className="mt-3 flex gap-2">
          <input
            name="name"
            type="text"
            placeholder="Template name"
            className="w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
          <button className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Create</button>
        </form>
      </section>

      {templateData.templates.map((template) => {
        const ranges = templateData.ranges.filter((r) => r.template_id === template.id);
        const shifts = templateData.shifts.filter((s) => s.template_id === template.id);

        return (
          <details key={template.id} className="rounded-lg border border-gray-200 bg-white" open={false}>
            <summary className="list-none cursor-pointer px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                  <p className="mt-1 text-sm text-gray-600">{shifts.length} shift(s), {ranges.length} range(s)</p>
                </div>
                <span className="text-xs font-medium text-gray-500">Click to expand</span>
              </div>
            </summary>

            <div className="border-t border-gray-200 p-4">
              <div className="mb-4 flex items-center justify-end gap-3">
                <form action={deleteShiftTemplate}>
                  <input type="hidden" name="templateId" value={String(template.id)} />
                  <button className="rounded border border-red-200 px-3 py-1 text-sm font-medium text-red-600">
                    Delete Template
                  </button>
                </form>
              </div>

            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                <span className="font-medium text-gray-900">Date Ranges</span>
                {ranges.map((range) => (
                  <span key={range.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 ring-1 ring-gray-200">
                    <span>{formatDate(range.start_date)} to {formatDate(range.end_date)}</span>
                    <form action={deleteTemplateDateRange}>
                      <input type="hidden" name="id" value={String(range.id)} />
                      <button className="text-xs font-medium text-red-600">Delete</button>
                    </form>
                  </span>
                ))}
              </div>
              <form action={createTemplateDateRange} className="mt-3 grid max-w-xl grid-cols-4 gap-2">
                <input type="hidden" name="templateId" value={String(template.id)} />
                <input name="startDate" type="date" className="rounded border border-gray-300 px-2 py-2 text-sm" required />
                <input name="endDate" type="date" className="rounded border border-gray-300 px-2 py-2 text-sm" required />
                <button className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white">Add Range</button>
              </form>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1180px] table-fixed border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-44 border border-gray-200 bg-gray-50 px-3 py-3 text-left font-semibold text-gray-900">
                      Staff
                    </th>
                    {STAFF_SCHEDULE_WEEKDAYS.map((weekday) => (
                      <th key={`${template.id}-${weekday}`} className="w-40 border border-gray-200 bg-gray-50 px-3 py-3 text-left font-semibold text-gray-900">
                        {weekday}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={`${template.id}-${user.id}`}>
                      <td className="sticky left-0 z-10 border border-gray-200 bg-white px-3 py-3 align-top">
                        <div className="font-semibold text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500">cap {user.coach_capacity}</div>
                      </td>
                      {STAFF_SCHEDULE_WEEKDAYS.map((weekday) => {
                        const cellShifts = shifts.filter((shift) => {
                          if (shift.weekday !== weekday) return false;
                          return templateData.assignments.some(
                            (assignment) => assignment.template_shift_id === shift.id && assignment.user_id === user.id,
                          );
                        });

                        return (
                          <td
                            key={`${template.id}-${user.id}-${weekday}`}
                            className={`border border-gray-200 px-2 py-2 align-top ${cellShifts.length > 0 ? 'bg-white' : 'bg-gray-50'}`}
                          >
                            <div className="space-y-2">
                              {cellShifts.map((shift) => {
                                const assignments = templateData.assignments.filter((a) => a.template_shift_id === shift.id);
                                return (
                                  <details key={shift.id} className="rounded bg-yellow-100 px-2 py-2 shadow-sm ring-1 ring-yellow-200">
                                    <summary className="cursor-pointer list-none">
                                      <div className="font-semibold text-gray-900">{formatTimeRange(shift.start_time, shift.end_time)}</div>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {shift.shift_types.map((type) => (
                                          <span key={`${shift.id}-${type}`} className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-200">
                                            {shiftTypeLabel(type)}
                                          </span>
                                        ))}
                                      </div>
                                      <div className="mt-1 text-[11px] text-gray-600">
                                        {assignments.map((a) => a.user_name).join(', ')}
                                      </div>
                                    </summary>

                                    <form action={updateTemplateShift} className="mt-2 space-y-2 border-t border-yellow-200 pt-2">
                                      <input type="hidden" name="id" value={String(shift.id)} />
                                      <input type="hidden" name="templateId" value={String(template.id)} />
                                      <select name="weekday" defaultValue={shift.weekday} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" required>
                                        {STAFF_SCHEDULE_WEEKDAYS.map((d) => (
                                          <option key={`${shift.id}-${d}`} value={d}>
                                            {d}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="grid grid-cols-2 gap-2">
                                        <input type="time" name="startTime" step={900} defaultValue={shift.start_time.slice(0, 5)} className="rounded border border-gray-300 px-2 py-1 text-xs" required />
                                        <input type="time" name="endTime" step={900} defaultValue={shift.end_time.slice(0, 5)} className="rounded border border-gray-300 px-2 py-1 text-xs" required />
                                      </div>
                                      <div className="grid grid-cols-1 gap-1 text-xs text-gray-700">
                                        {SHIFT_TYPE_OPTIONS.map((opt) => (
                                          <label key={`edit-${shift.id}-${opt.value}`} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1">
                                            <input
                                              type="checkbox"
                                              name="shiftTypes"
                                              value={opt.value}
                                              defaultChecked={shift.shift_types.includes(opt.value)}
                                              className="h-3.5 w-3.5 rounded border-gray-300"
                                            />
                                            <span>{opt.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                      <button className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white">Update Shift</button>
                                    </form>

                                    <div className="mt-2 rounded bg-white p-2 ring-1 ring-gray-200">
                                      <div className="text-xs font-semibold text-gray-700">Assigned Staff</div>
                                      <ul className="mt-1 space-y-1">
                                        {assignments.map((assignment) => (
                                          <li key={assignment.id} className="flex items-center justify-between gap-2 text-xs text-gray-700">
                                            <span>{assignment.user_name}</span>
                                            <form action={unassignStaffFromTemplateShift}>
                                              <input type="hidden" name="id" value={String(assignment.id)} />
                                              <button className="font-medium text-red-600">Remove</button>
                                            </form>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>

                                    <form action={deleteTemplateShift} className="mt-2">
                                      <input type="hidden" name="id" value={String(shift.id)} />
                                      <button className="text-xs font-medium text-red-600">Delete Shift</button>
                                    </form>
                                  </details>
                                );
                              })}

                              <details>
                                <summary className="inline-flex cursor-pointer items-center rounded border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900">
                                  + Add shift
                                </summary>
                                <form action={createTemplateShiftWithStaff} className="mt-2 space-y-2 rounded border border-gray-200 bg-gray-50 p-2">
                                  <input type="hidden" name="templateId" value={String(template.id)} />
                                  <input type="hidden" name="weekday" value={weekday} />
                                  <input type="hidden" name="userId" value={user.id} />
                                  <div className="grid grid-cols-2 gap-2">
                                    <input name="startTime" type="time" step={900} className="rounded border border-gray-300 px-2 py-1 text-xs" required />
                                    <input name="endTime" type="time" step={900} className="rounded border border-gray-300 px-2 py-1 text-xs" required />
                                  </div>
                                  <div className="grid grid-cols-1 gap-1 text-xs text-gray-700">
                                    {SHIFT_TYPE_OPTIONS.map((opt) => (
                                      <label key={`${template.id}-${user.id}-${weekday}-${opt.value}`} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1">
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
            </div>
          </details>
        );
      })}
    </div>
  );
}

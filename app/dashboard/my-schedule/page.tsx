import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  createMyAbsenceRequest,
  deleteMyAbsenceRequest,
  updateMyAbsenceRequest,
} from '@/app/lib/actions';
import {
  fetchMyAbsenceRequests,
  fetchMyWeeklySchedule,
  fetchStaffAvailability,
} from '@/app/lib/staff-schedule-data';
import AvailabilityGrid from '@/app/ui/my-schedule/availability-grid';

export const metadata = {
  title: 'My Schedule',
};

type SearchParams = Promise<{
  weekStart?: string;
}>;

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

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

export default async function MySchedulePage(props: { searchParams?: SearchParams }) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const userName = (session?.user as any)?.name as string | undefined;
  if (!userId) {
    redirect('/login');
  }

  const searchParams = await props.searchParams;
  const requestedWeekStart = searchParams?.weekStart;

  const [weekly, availability, requests] = await Promise.all([
    fetchMyWeeklySchedule(userId, requestedWeekStart),
    fetchStaffAvailability(userId),
    fetchMyAbsenceRequests(userId),
  ]);

  const prevWeek = shiftDate(weekly.weekStart, -7);
  const nextWeek = shiftDate(weekly.weekStart, 7);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
        <p className="mt-1 text-sm text-gray-600">
          {userName}. Review your shifts, set weekly availability, and submit absence requests.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700" href={`/dashboard/my-schedule?weekStart=${prevWeek}`}>
          Previous Week
        </Link>
        <div className="rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800">Week of {weekly.weekStart}</div>
        <Link className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700" href={`/dashboard/my-schedule?weekStart=${nextWeek}`}>
          Next Week
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">My Work Schedule</h2>
        <p className="mt-1 text-sm text-gray-600">Simplified weekly view. Shows your own shifts and who else overlaps with you.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {weekly.days.map((day) => (
            <div key={day.date} className="rounded-md border border-gray-200 p-3">
              <h3 className="font-semibold text-gray-800">
                {day.weekday} <span className="text-sm font-normal text-gray-500">({day.date})</span>
              </h3>
              {day.shifts.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No shifts</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {day.shifts.map((shift, idx) => (
                    <div key={`${shift.date}-${shift.start_time}-${idx}`} className="rounded bg-yellow-100 px-3 py-2 ring-1 ring-yellow-200">
                      <div className="font-semibold text-gray-900">{formatTimeRange(shift.start_time, shift.end_time)}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {shift.shift_types.map((type) => (
                          <span key={`${shift.date}-${shift.start_time}-${type}`} className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-200">
                            {shiftTypeLabel(type)}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-gray-600">
                        {shift.co_workers.length === 0 ? (
                          <span>Working solo</span>
                        ) : (
                          <div>
                            <div className="mb-1 font-medium text-gray-700">Working with:</div>
                            <ul className="space-y-1">
                              {shift.co_workers.map((worker) => (
                                <li key={`${shift.date}-${shift.start_time}-${worker.user_id}`}>
                                  {worker.user_name} ({formatTimeRange(worker.start_time, worker.end_time)})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Weekly Availability</h2>
        <AvailabilityGrid blocks={availability} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">Request Absence</h2>
          <p className="mt-1 text-sm text-gray-600">Submit a request for admin approval. Requested absences do not change the live schedule until approved.</p>
          <form action={createMyAbsenceRequest} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input name="startDate" type="date" className="rounded border border-gray-300 px-3 py-2 text-sm" required />
              <input name="endDate" type="date" className="rounded border border-gray-300 px-3 py-2 text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input name="startTime" type="time" step={60} defaultValue="00:00" className="rounded border border-gray-300 px-3 py-2 text-sm" required />
              <input name="endTime" type="time" step={60} defaultValue="23:59" className="rounded border border-gray-300 px-3 py-2 text-sm" required />
            </div>
            <textarea name="note" rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Reason or note (optional)" />
            <button className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Submit Request</button>
          </form>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">My Absence Requests</h2>
          <div className="mt-4 space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="rounded border border-gray-200 p-3">
                {request.status === 'requested' ? (
                  <form action={updateMyAbsenceRequest} className="space-y-2">
                    <input type="hidden" name="id" value={String(request.id)} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">requested</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input name="startDate" type="date" defaultValue={request.start_date} className="rounded border border-gray-300 px-2 py-1 text-sm" required />
                      <input name="endDate" type="date" defaultValue={request.end_date} className="rounded border border-gray-300 px-2 py-1 text-sm" required />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input name="startTime" type="time" step={60} defaultValue={request.start_time.slice(0, 5)} className="rounded border border-gray-300 px-2 py-1 text-sm" required />
                      <input name="endTime" type="time" step={60} defaultValue={request.end_time.slice(0, 5)} className="rounded border border-gray-300 px-2 py-1 text-sm" required />
                    </div>
                    <textarea name="note" defaultValue={request.note || ''} rows={2} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="Reason or note (optional)" />
                    <div className="flex items-center gap-3">
                      <button className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white">Save</button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">approved</span>
                    </div>
                    <div className="text-sm text-gray-700">{request.start_date} {formatTimeRange(request.start_time, request.end_time)} to {request.end_date}</div>
                    {request.note ? <div className="text-sm text-gray-600">{request.note}</div> : null}
                  </div>
                )}
                {request.status === 'requested' ? (
                  <form action={deleteMyAbsenceRequest} className="mt-2">
                    <input type="hidden" name="id" value={String(request.id)} />
                    <button className="text-xs font-medium text-red-600">Delete</button>
                  </form>
                ) : null}
              </div>
            ))}
            {requests.length === 0 ? <p className="text-sm text-gray-500">No absence requests yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

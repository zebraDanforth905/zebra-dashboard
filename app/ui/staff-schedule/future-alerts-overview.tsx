'use client';

import Link from 'next/link';
import { createStaffAbsence, deleteStaffAbsence, updateStaffAbsence } from '@/app/lib/actions';
import { StaffScheduleFutureOverview, StaffScheduleUser } from '@/app/lib/staff-schedule-types';
import { useState, useTransition } from 'react';

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

function toWeekStart(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay();
  const mondayDelta = (day + 6) % 7;
  d.setDate(d.getDate() - mondayDelta);
  return d.toISOString().slice(0, 10);
}

type FutureAlertsOverviewProps = {
  overview: StaffScheduleFutureOverview;
  users: StaffScheduleUser[];
};

export function FutureAlertsOverview({ overview, users }: FutureAlertsOverviewProps) {
  const [activeOverview, setActiveOverview] = useState(overview);
  const [monthInput, setMonthInput] = useState(overview.selected_month);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showAddAbsence, setShowAddAbsence] = useState(false);
  const [editingAbsenceId, setEditingAbsenceId] = useState<number | null>(null);

  async function refreshForMonth(nextMonth: string) {
    setLoadError(null);
    const response = await fetch(`/api/staff-schedule/future-overview?month=${encodeURIComponent(nextMonth)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error('Unable to load warnings for that month');
    }
    const json = (await response.json()) as StaffScheduleFutureOverview;
    setActiveOverview(json);
    setMonthInput(json.selected_month);
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-amber-900">Future Staffing Overview</h2>
          <p className="mt-1 text-sm text-amber-800">
            Upcoming warnings from {activeOverview.from_date} through {activeOverview.through_date}, plus all pending absence requests.
          </p>
        </div>
        <div className="text-xs font-medium text-amber-800">
          {activeOverview.pending_absence_requests.length} request(s) pending • {activeOverview.warnings.length} warning(s)
        </div>
      </div>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const nextMonth = String(formData.get('warningMonth') || '').trim();
          if (!nextMonth) return;
          startTransition(async () => {
            try {
              await refreshForMonth(nextMonth);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unable to load warnings';
              setLoadError(message);
            }
          });
        }}
      >
        <label className="text-xs font-medium text-amber-900" htmlFor="warningMonth">
          Warning month
        </label>
        <input
          id="warningMonth"
          name="warningMonth"
          type="month"
          value={monthInput}
          onChange={(event) => setMonthInput(event.currentTarget.value)}
          className="rounded border border-amber-300 bg-white px-2 py-1 text-sm text-gray-900"
        />
        <button
          disabled={isPending}
          className="rounded bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {isPending ? 'Loading...' : 'View Month'}
        </button>
      </form>
      {loadError ? <p className="mt-2 text-xs font-medium text-red-700">{loadError}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-amber-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Absence Requests Needing Approval</h3>
          {activeOverview.pending_absence_requests.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No pending requests.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activeOverview.pending_absence_requests.map((request) => (
                <li key={request.id} className="rounded border border-gray-200 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900">{request.user_name}</div>
                      <div className="text-xs text-gray-600">
                        {request.start_date} to {request.end_date} • {formatTimeRange(request.start_time, request.end_time)}
                      </div>
                      {request.note ? <div className="mt-1 text-xs text-gray-700">Note: {request.note}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          startTransition(async () => {
                            await updateStaffAbsence(formData);
                            await refreshForMonth(activeOverview.selected_month);
                          });
                        }}
                        className="flex items-center"
                      >
                        <input type="hidden" name="id" value={request.id} />
                        <input type="hidden" name="userId" value={request.user_id} />
                        <input type="hidden" name="startDate" value={request.start_date} />
                        <input type="hidden" name="endDate" value={request.end_date} />
                        <input type="hidden" name="startTime" value={request.start_time.slice(0, 5)} />
                        <input type="hidden" name="endTime" value={request.end_time.slice(0, 5)} />
                        <input type="hidden" name="note" value={request.note || ''} />
                        <input type="hidden" name="status" value="approved" />
                        <button type="submit" disabled={isPending} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                          Approve
                        </button>
                      </form>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          startTransition(async () => {
                            await deleteStaffAbsence(formData);
                            await refreshForMonth(activeOverview.selected_month);
                          });
                        }}
                        className="flex items-center"
                      >
                        <input type="hidden" name="id" value={request.id} />
                        <button type="submit" disabled={isPending} className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">
                          Discard
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded border border-amber-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-gray-900">Future Understaffed or Qualification Warnings</h3>
          {activeOverview.warnings.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No upcoming staffing warnings.</p>
          ) : (
            <ul className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
              {activeOverview.warnings.map((warning, index) => (
                <li key={`${warning.type}-${warning.date}-${warning.start_time}-${index}`} className="rounded border border-gray-200 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">{warning.type === 'understaffed' ? 'Understaffed' : 'Qualification'}</div>
                      <div className="font-medium text-gray-900">{warning.weekday} {warning.date} • {formatTimeRange(warning.start_time, warning.end_time)}</div>
                      <div className="mt-0.5 text-sm text-gray-700">{warning.message}</div>
                    </div>
                    <Link
                      href={`/dashboard/staff-schedule?view=weekly&weekStart=${toWeekStart(warning.date)}&warningMonth=${activeOverview.selected_month}`}
                      className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Take me to week
                    </Link>
                  </div>

                  <div className="mt-2 text-xs text-gray-600">Suggested coaches</div>
                  {warning.suggestions.length === 0 ? (
                    <div className="text-xs text-gray-500">No qualified and available coach found for this time slot.</div>
                  ) : (
                    <details className="mt-1 rounded border border-gray-200 bg-gray-50 p-2">
                      <summary className="cursor-pointer text-xs font-medium text-gray-700">
                        Show {warning.suggestions.length} suggested coach{warning.suggestions.length === 1 ? '' : 'es'}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {warning.suggestions.map((suggestion) => (
                          <li key={`${warning.date}-${warning.start_time}-${suggestion.user_id}`} className="text-xs text-gray-800">
                            {suggestion.user_name}: {suggestion.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* All Absences */}
      <div className="mt-4 rounded border border-amber-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">
            All Absences ({activeOverview.all_absences.length})
          </h3>
          <button
            type="button"
            onClick={() => { setShowAddAbsence((v) => !v); setEditingAbsenceId(null); }}
            className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white"
          >
            {showAddAbsence ? 'Cancel' : '+ Add Absence'}
          </button>
        </div>

        {showAddAbsence && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              startTransition(async () => {
                await createStaffAbsence(formData);
                setShowAddAbsence(false);
                await refreshForMonth(activeOverview.selected_month);
              });
            }}
            className="mt-3 rounded border border-gray-200 bg-gray-50 p-3"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700">Staff member</label>
                <select name="userId" required className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="">Select staff…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Start date</label>
                <input type="date" name="startDate" required className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">End date</label>
                <input type="date" name="endDate" required className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Start time</label>
                <input type="time" name="startTime" step={60} required defaultValue="00:00" className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">End time</label>
                <input type="time" name="endTime" step={60} required defaultValue="23:59" className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Status</label>
                <select name="status" className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                  <option value="approved">Approved</option>
                  <option value="requested">Requested</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Note</label>
                <input type="text" name="note" className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <button type="submit" disabled={isPending} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                {isPending ? 'Saving...' : 'Save Absence'}
              </button>
            </div>
          </form>
        )}

        {activeOverview.all_absences.length === 0 && !showAddAbsence ? (
          <p className="mt-2 text-sm text-gray-500">No absences recorded for this month.</p>
        ) : (
          <ul className="mt-3 max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
            {activeOverview.all_absences.map((absence) =>
              editingAbsenceId === absence.id ? (
                <li key={absence.id} className="rounded border border-blue-200 bg-blue-50 p-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      startTransition(async () => {
                        await updateStaffAbsence(formData);
                        setEditingAbsenceId(null);
                        await refreshForMonth(activeOverview.selected_month);
                      });
                    }}
                  >
                    <input type="hidden" name="id" value={absence.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700">Staff member</label>
                        <select name="userId" required defaultValue={absence.user_id} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Start date</label>
                        <input type="date" name="startDate" required defaultValue={absence.start_date} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">End date</label>
                        <input type="date" name="endDate" required defaultValue={absence.end_date} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Start time</label>
                        <input type="time" name="startTime" step={60} required defaultValue={absence.start_time.slice(0, 5)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">End time</label>
                        <input type="time" name="endTime" step={60} required defaultValue={absence.end_time.slice(0, 5)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Status</label>
                        <select name="status" defaultValue={absence.status} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                          <option value="approved">Approved</option>
                          <option value="requested">Requested</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Note</label>
                        <input type="text" name="note" defaultValue={absence.note || ''} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingAbsenceId(null)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        Cancel
                      </button>
                      <button type="submit" disabled={isPending} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                        {isPending ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={absence.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900">{absence.user_name}</span>
                    <span className="mx-1.5 text-gray-400">·</span>
                    <span className="text-gray-700">{absence.start_date}{absence.start_date !== absence.end_date ? ` → ${absence.end_date}` : ''}</span>
                    <span className="mx-1.5 text-gray-400">·</span>
                    <span className="text-gray-700">{formatTimeRange(absence.start_time.slice(0, 5), absence.end_time.slice(0, 5))}</span>
                    {absence.status === 'requested' && (
                      <span className="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Pending</span>
                    )}
                    {absence.note ? <span className="ml-2 text-xs italic text-gray-500">{absence.note}</span> : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setEditingAbsenceId(absence.id); setShowAddAbsence(false); }}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Edit
                    </button>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        startTransition(async () => {
                          await deleteStaffAbsence(formData);
                          await refreshForMonth(activeOverview.selected_month);
                        });
                      }}
                    >
                      <input type="hidden" name="id" value={absence.id} />
                      <button
                        type="submit"
                        disabled={isPending}
                        className="rounded border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

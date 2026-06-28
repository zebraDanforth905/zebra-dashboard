"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  getEnrolmentAttendance,
  setEnrolmentAttendance,
  type AttendanceValue,
} from "@/app/lib/attendance-actions";
import type { EnrolmentView } from "./student-enrolments";

type Props = {
  studentId: number;
  studentName: string;
  enrolment: EnrolmentView;
  // Queued (not-yet-applied) inactivation date for this enrolment, if any. Class
  // dates after it are hidden — the student won't be attending past that date.
  pendingEndDate?: string | null;
  onClose: () => void;
};

// How far back / forward the session list reaches. The past cap bounds the
// branch-wide attendance read for an enrolment with no usable start date; the
// future cap lets you mark upcoming absences ahead of time (capped so an
// open-ended enrolment doesn't generate an unbounded list).
const PAST_CAP_WEEKS = 26;
const FUTURE_CAP_WEEKS = 12;

const DOW: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Weekly class dates on `day` from `from` through `to`, ascending.
function classDates(day: string, from: Date, to: Date): string[] {
  const target = DOW[day.trim().toLowerCase()];
  if (target === undefined) return [];
  const out: string[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  while (cur.getDay() !== target) cur.setDate(cur.getDate() + 1);
  while (cur <= to) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function formatDateLabel(iso: string): string {
  const d = parseDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const VALUE_OPTIONS: { value: AttendanceValue; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "unmarked", label: "Unmarked" },
];

function badgeClass(value: AttendanceValue): string {
  switch (value) {
    case "present":
      return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    case "absent":
      return "bg-rose-50 text-rose-700 border border-rose-100";
    default:
      return "bg-slate-50 text-slate-500 border border-slate-200";
  }
}

export default function ManageAttendanceModal({
  studentId,
  studentName,
  enrolment,
  pendingEndDate,
  onClose,
}: Props) {
  const batch = enrolment.batch!; // guarded by the caller
  const [firstName, ...rest] = (studentName ?? "").trim().split(/\s+/);
  const lastName = rest.join(" ");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, AttendanceValue>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);

  // The class-date window for this enrolment, newest first for display.
  const { dates, fromDate, toDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // The enrolment effectively ends at the earlier of its portal end date and
    // any queued (pending) inactivation date — never list class dates beyond it.
    const portalEnd = parseDate(batch.endDate);
    const pendingEnd = parseDate(pendingEndDate);
    const enddate =
      portalEnd && pendingEnd
        ? pendingEnd < portalEnd
          ? pendingEnd
          : portalEnd
        : pendingEnd ?? portalEnd;
    const ended = !!enddate && enddate < today;

    // End: a past enrolment stops at its end date; an active/open-ended one runs
    // up to its end date (if any) but no further than the future cap.
    let end: Date;
    if (ended) {
      end = enddate!;
    } else {
      const futureCap = new Date(today);
      futureCap.setDate(futureCap.getDate() + FUTURE_CAP_WEEKS * 7);
      end = enddate && enddate < futureCap ? enddate : futureCap;
    }

    // Start: a past cap back from the end (ended enrolments) or from today
    // (active enrolments, so recent past stays visible alongside upcoming dates).
    const floor = new Date(ended ? end : today);
    floor.setDate(floor.getDate() - PAST_CAP_WEEKS * 7);
    const enrolled = parseDate(enrolment.enrolledOn);
    const start = !enrolled || enrolled < floor ? floor : enrolled;

    const asc = classDates(batch.day, start, end);
    return { dates: [...asc].reverse(), fromDate: ymd(start), toDate: ymd(end) };
  }, [batch.day, batch.endDate, enrolment.enrolledOn, pendingEndDate]);

  const todayIso = ymd(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEnrolmentAttendance({
      studentId,
      day: batch.day,
      startTime: batch.startTime,
      fromDate,
      toDate,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const v: Record<string, AttendanceValue> = {};
        const l: Record<string, string> = {};
        for (const rec of res.records) {
          v[rec.date] = rec.value;
          l[rec.date] = rec.label;
        }
        setValues(v);
        setLabels(l);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, batch.day, batch.startTime, fromDate, toDate]);

  const handleSet = async (date: string, value: AttendanceValue) => {
    const previous = values[date] ?? "unmarked";
    if (previous === value) return;

    setSavingDate(date);
    setError(null);
    setValues((prev) => ({ ...prev, [date]: value })); // optimistic

    const res = await setEnrolmentAttendance({
      studentId,
      day: batch.day,
      startTime: batch.startTime,
      endTime: batch.endTime || undefined,
      date,
      value,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    });

    if (!res.ok) {
      setValues((prev) => ({ ...prev, [date]: previous })); // rollback
      setError(res.error);
    } else {
      setLabels((prev) => ({
        ...prev,
        [date]: VALUE_OPTIONS.find((o) => o.value === value)?.label ?? value,
      }));
    }
    setSavingDate(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Manage Attendance</h2>
            <p className="mt-0.5 truncate text-xs text-gray-600">
              {studentName || `Student ${studentId}`} · {enrolment.courseName}
              {enrolment.subCourseCode ? ` (${enrolment.subCourseCode})` : ""}
            </p>
            <p className="text-xs text-gray-500">
              {batch.day} {batch.startTime.slice(0, 5)}
              {batch.endTime ? `–${batch.endTime.slice(0, 5)}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100" title="Close">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading attendance…</div>
          ) : dates.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No class sessions found for this enrolment.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {dates.map((date) => {
                const value = values[date] ?? "unmarked";
                const isSaving = savingDate === date;
                const isUpcoming = date > todayIso;
                return (
                  <li key={date} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        {formatDateLabel(date)}
                        {isUpcoming && (
                          <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-100">
                            Upcoming
                          </span>
                        )}
                      </div>
                      <span
                        className={clsx(
                          "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          badgeClass(value),
                        )}
                      >
                        {labels[date] ?? "Unmarked"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {VALUE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSet(date, opt.value)}
                          className={clsx(
                            "rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                            value === opt.value
                              ? opt.value === "present"
                                ? "border-emerald-300 bg-emerald-600 text-white"
                                : opt.value === "absent"
                                  ? "border-rose-300 bg-rose-600 text-white"
                                  : "border-slate-300 bg-slate-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t p-3">
          <button
            onClick={onClose}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

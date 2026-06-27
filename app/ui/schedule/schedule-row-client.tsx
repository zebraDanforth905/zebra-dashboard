'use client';

import Link from "next/link";
import clsx from "clsx";
import { useState } from "react";
import { formatDate } from "@/app/lib/utils";
import {
  cancelMakeup,
  setPortalAttendance,
  type PortalAttendanceValue,
} from "@/app/lib/actions";
import StudentNoteCell from "../students/student-note-cell";
import TrialNoteCell from "./trial-note-cell";
import { ScheduleRow, MakeupRow, TrialRow } from "@/app/lib/definitions";

type Props = {
  students: ScheduleRow[];
  trials: TrialRow[];
  makeups: MakeupRow[];
  currentUserName: string;
  // The date these rows apply to, as 'YYYY-MM-DD'. Required to write
  // attendance to the portal; when absent, the buttons are disabled.
  sessionDate?: string;
  // Per-enrolment seed status read live from the portal (present/absent/
  // unmarked). When omitted for a row, falls back to the local absent flag.
  initialAttendance?: Record<string, PortalAttendanceValue>;
};

const ATTENDANCE_OPTIONS: Array<{
  value: PortalAttendanceValue;
  label: string;
  // Tailwind classes for the active (selected) state.
  active: string;
}> = [
  { value: "present", label: "Present", active: "bg-emerald-600 text-white border-emerald-600" },
  { value: "unmarked", label: "Unmarked", active: "bg-slate-600 text-white border-slate-600" },
  { value: "absent", label: "Absent", active: "bg-rose-600 text-white border-rose-600" },
];

function AttendanceButtons({
  value,
  isSaving,
  disabled,
  onSelect,
}: {
  value: PortalAttendanceValue;
  isSaving: boolean;
  disabled: boolean;
  onSelect: (next: PortalAttendanceValue) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label="Attendance"
      title={disabled ? "No session date — cannot set attendance" : undefined}
    >
      {ATTENDANCE_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            disabled={disabled || isSaving}
            onClick={() => onSelect(opt.value)}
            className={clsx(
              "rounded-lg border px-2 py-1 text-[11px] font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60",
              isActive
                ? opt.active
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ScheduleRowClient({ students, trials, makeups, currentUserName, sessionDate, initialAttendance }: Props) {
  const [cancellingMakeupId, setCancellingMakeupId] = useState<string | null>(null);

  // Per-enrolment attendance value, seeded from the live portal status when
  // available (initialAttendance), otherwise from the local absence flag.
  const [attendance, setAttendance] = useState<Record<string, PortalAttendanceValue>>(() => {
    const initial: Record<string, PortalAttendanceValue> = {};
    for (const s of students) {
      initial[s.enrolment_id] =
        initialAttendance?.[s.enrolment_id] ?? (s.absent ? "absent" : "unmarked");
    }
    return initial;
  });
  const [savingEnrolmentId, setSavingEnrolmentId] = useState<string | null>(null);

  const handleSetAttendance = async (student: ScheduleRow, next: PortalAttendanceValue) => {
    if (!sessionDate) return;
    const prev = attendance[student.enrolment_id] ?? "unmarked";
    if (prev === next) return;

    // Optimistic update; revert on failure.
    setAttendance((cur) => ({ ...cur, [student.enrolment_id]: next }));
    setSavingEnrolmentId(student.enrolment_id);
    try {
      const result = await setPortalAttendance({
        enrolmentId: student.enrolment_id,
        studentId: student.student_id,
        date: sessionDate,
        value: next,
      });
      if (!result.ok) {
        setAttendance((cur) => ({ ...cur, [student.enrolment_id]: prev }));
        alert(result.error || "Failed to update attendance");
      }
    } catch (error) {
      console.error("Failed to update attendance:", error);
      setAttendance((cur) => ({ ...cur, [student.enrolment_id]: prev }));
      alert("Failed to update attendance");
    } finally {
      setSavingEnrolmentId(null);
    }
  };

  const handleCancelMakeup = async (makeupId: string) => {
    if (confirm('Are you sure you want to cancel this makeup?')) {
      try {
        setCancellingMakeupId(makeupId);
        await cancelMakeup(makeupId);
      } catch (error) {
        console.error('Failed to cancel makeup:', error);
        alert('Failed to cancel makeup');
      } finally {
        setCancellingMakeupId(null);
      }
    }
  };

  return (
    <div className="mt-4 rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 md:py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-800">Session</h2>
        <p className="text-xs text-slate-500 hidden sm:block">
          Trials, makeups, and enrolled students
        </p>
      </div>

      {/* Scrollable list */}
      <div className="max-h-[60vh] md:max-h-80 overflow-y-auto divide-y divide-slate-100">
        {/* Trials */}
        {trials.map((student) => (
          <div
            key={student.trial_id + student.name}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-3 md:px-4 py-2 text-sm bg-amber-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900 truncate">
                  {student.name}
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  Trial
                </span>
              </div>
              <div className="text-xs text-slate-500 truncate">
                {student.course_name}
              </div>
              <div className="text-[11px] text-slate-400">
                {student.date.toDateString()}
              </div>
            </div>

            <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center gap-2">
              <div className="w-full md:min-w-[250px]">
                <TrialNoteCell 
                  trial={student}
                  currentUserName={currentUserName} 
                />
              </div>
            </div>
          </div>
        ))}

        {/* Makeups */}
        {makeups.map((student) => (
          <div
            key={student.makeup_id + student.name}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-3 md:px-4 py-2 text-sm bg-sky-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900 truncate">
                  {student.name}
                </span>
                {student.parent_name && (
                  <span className="text-xs text-slate-400 truncate">
                    ({student.parent_name})
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  Makeup
                </span>
              </div>
              <div className="text-xs text-slate-500 truncate">
                {student.course_name}
              </div>
              <div className="text-[11px] text-slate-400">
                {formatDate(student.date)}
              </div>
            </div>

            <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center gap-2">
              <div className="w-full md:min-w-[250px]">
                <StudentNoteCell 
                  student={{ 
                    id: student.student_id, 
                    name: student.name,
                    recent_note: student.recent_note || null
                  } as any} 
                  currentUserName={currentUserName} 
                />
              </div>
              <button
                type="button"
                onClick={() => handleCancelMakeup(student.makeup_id)}
                disabled={cancellingMakeupId === student.makeup_id}
                className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 flex-shrink-0 disabled:opacity-60"
              >
                {cancellingMakeupId === student.makeup_id ? 'Cancelling...' : 'Cancel'}
              </button>
            </div>
          </div>
        ))}

        {/* Regular enrolled students */}
        {students.map((student) => {
          const status = attendance[student.enrolment_id] ?? "unmarked";
          return (
          <div
            key={student.enrolment_id}
            className={clsx(
              "flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-3 md:px-4 py-2 text-sm",
              status === "absent"
                ? "bg-rose-50"
                : status === "present"
                ? "bg-emerald-50"
                : "bg-white"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900 truncate">
                  {student.name}
                </span>
                {student.parent_name && (
                  <span className="text-xs text-slate-400 truncate">
                    ({student.parent_name})
                  </span>
                )}
                {status === "absent" && (
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                    Absent
                  </span>
                )}
                {status === "present" && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    Present
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {student.course_name}
              </div>
            </div>

            <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center gap-2">
              <AttendanceButtons
                value={status}
                isSaving={savingEnrolmentId === student.enrolment_id}
                disabled={!sessionDate}
                onSelect={(next) => handleSetAttendance(student, next)}
              />
              <div className="w-full md:min-w-[250px]">
                <StudentNoteCell
                  student={{
                    id: student.student_id,
                    name: student.name,
                    recent_note: student.recent_note || null
                  } as any}
                  currentUserName={currentUserName}
                />
              </div>
              <Link
                href={`/dashboard/students/${student.student_id}/edit`}
                className="inline-flex items-center rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300 flex-shrink-0"
              >
                Edit
              </Link>
            </div>
          </div>
          );
        })}

        {trials.length === 0 && makeups.length === 0 && students.length === 0 && (
          <div className="px-3 md:px-4 py-4 md:py-6 text-center text-xs md:text-sm text-slate-500">
            No students scheduled for this session.
          </div>
        )}
      </div>
    </div>
  );
}

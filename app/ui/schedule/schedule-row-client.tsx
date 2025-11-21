'use client';

import Link from "next/link";
import clsx from "clsx";
import { formatDate } from "@/app/lib/utils";
import StudentNoteCell from "../students/student-note-cell";
import { ScheduleRow, MakeupRow, TrialRow } from "@/app/lib/definitions";

type Props = {
  students: ScheduleRow[];
  trials: TrialRow[];
  makeups: MakeupRow[];
  currentUserName: string;
};

export default function ScheduleRowClient({ students, trials, makeups, currentUserName }: Props) {
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
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 md:px-4 py-2 text-sm bg-amber-50"
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
          </div>
        ))}

        {/* Makeups */}
        {makeups.map((student) => (
          <div
            key={student.makeup_id + student.name}
            className="flex flex-col gap-2 px-3 md:px-4 py-2 text-sm bg-sky-50"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 truncate">
                    {student.name}
                  </span>
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

              <Link
                href={`/dashboard/students/${student.student_id}/edit`}
                className="inline-flex items-center rounded-xl border border-sky-500 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300 flex-shrink-0"
              >
                Edit
              </Link>
            </div>

            <div className="w-full">
              <StudentNoteCell 
                student={{ 
                  id: student.student_id, 
                  name: student.name,
                  recent_note: student.recent_note || null
                } as any} 
                currentUserName={currentUserName} 
              />
            </div>
          </div>
        ))}

        {/* Regular enrolled students */}
        {students.map((student) => (
          <div
            key={student.enrolment_id}
            className={clsx(
              "flex flex-col gap-2 px-3 md:px-4 py-2 text-sm",
              student.absent ? "bg-rose-50" : "bg-white"
            )}
          >
            <div className="flex items-center justify-between gap-2">
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
                  {student.absent && (
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                      Absent
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {student.course_name}
                </div>
              </div>

              <Link
                href={`/dashboard/students/${student.student_id}/edit`}
                className="inline-flex items-center rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300 flex-shrink-0"
              >
                Edit
              </Link>
            </div>

            <div className="w-full">
              <StudentNoteCell 
                student={{ 
                  id: student.student_id, 
                  name: student.name,
                  recent_note: student.recent_note || null
                } as any} 
                currentUserName={currentUserName} 
              />
            </div>
          </div>
        ))}

        {trials.length === 0 && makeups.length === 0 && students.length === 0 && (
          <div className="px-3 md:px-4 py-4 md:py-6 text-center text-xs md:text-sm text-slate-500">
            No students scheduled for this session.
          </div>
        )}
      </div>
    </div>
  );
}

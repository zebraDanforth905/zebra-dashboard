"use client";

import { useState } from "react";
import clsx from "clsx";
import { CalendarDaysIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import ManageAttendanceModal from "./manage-attendance-modal";
import ManageInactivationModal from "./manage-inactivation-modal";

export type EnrolmentView = {
  studentBatchId: number;
  courseName: string;
  subCourseCode: string | null;
  totalAmount: string;
  enrolledOn: string | null;
  isCurrent: boolean;
  batch: {
    batchId: number;
    day: string;
    startTime: string;
    endTime: string;
    endDate: string | null;
  } | null;
};

type Props = {
  studentId: string;
  studentName: string;
  current: EnrolmentView[];
  past: EnrolmentView[];
  // student_batch_id -> queued end date (YYYY-MM-DD) for a scheduled inactivation.
  pendingInactivations: Record<number, string>;
};

function hhmm(t: string): string {
  return (t ?? "").trim().slice(0, 5);
}

function scheduleLabel(batch: EnrolmentView["batch"]): string {
  if (!batch || !batch.day) return "No scheduled class";
  const time = batch.startTime
    ? `${hhmm(batch.startTime)}${batch.endTime ? `–${hhmm(batch.endTime)}` : ""}`
    : "";
  return `${batch.day}${time ? ` ${time}` : ""}`;
}

function EnrolmentRow({
  enrolment,
  pendingEndDate,
  onManage,
  onEnd,
}: {
  enrolment: EnrolmentView;
  pendingEndDate: string | null;
  onManage: (e: EnrolmentView) => void;
  onEnd: (e: EnrolmentView) => void;
}) {
  const canManage = !!enrolment.batch?.day && !!enrolment.batch?.startTime;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate font-medium text-slate-900">
          {enrolment.courseName}
          {enrolment.subCourseCode ? (
            <span className="ml-2 text-xs font-normal text-slate-500">{enrolment.subCourseCode}</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {scheduleLabel(enrolment.batch)}
          {enrolment.batch?.endDate ? ` · ends ${enrolment.batch.endDate.slice(0, 10)}` : ""}
        </div>
        {pendingEndDate && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-100">
            Ending {pendingEndDate}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onManage(enrolment)}
          disabled={!canManage}
          title={canManage ? "Manage attendance" : "No scheduled class to track"}
          className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDaysIcon className="h-4 w-4" />
          Attendance
        </button>
        <button
          type="button"
          onClick={() => onEnd(enrolment)}
          title={pendingEndDate ? "Edit or undo scheduled end date" : "Set an end date"}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2",
            pendingEndDate
              ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 focus:ring-amber-300"
              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus:ring-rose-300",
          )}
        >
          <NoSymbolIcon className="h-4 w-4" />
          {pendingEndDate ? "Edit end date" : "End enrolment"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  enrolments,
  emptyText,
  pending,
  onManage,
  onEnd,
  muted,
}: {
  title: string;
  enrolments: EnrolmentView[];
  emptyText: string;
  pending: Record<number, string>;
  onManage: (e: EnrolmentView) => void;
  onEnd: (e: EnrolmentView) => void;
  muted?: boolean;
}) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title} <span className="text-slate-400">({enrolments.length})</span>
      </h2>
      <div
        className={clsx(
          "rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100",
          muted && "opacity-90",
        )}
      >
        {enrolments.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">{emptyText}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {enrolments.map((e) => (
              <EnrolmentRow
                key={e.studentBatchId}
                enrolment={e}
                pendingEndDate={pending[e.studentBatchId] ?? null}
                onManage={onManage}
                onEnd={onEnd}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentEnrolments({
  studentId,
  studentName,
  current,
  past,
  pendingInactivations,
}: Props) {
  const [selected, setSelected] = useState<EnrolmentView | null>(null);
  const [ending, setEnding] = useState<EnrolmentView | null>(null);
  const [pending, setPending] = useState<Record<number, string>>(pendingInactivations);

  const handleChanged = (studentBatchId: number, endDate: string | null) => {
    setPending((prev) => {
      const next = { ...prev };
      if (endDate) next[studentBatchId] = endDate;
      else delete next[studentBatchId];
      return next;
    });
  };

  return (
    <>
      <Section
        title="Current enrolments"
        enrolments={current}
        emptyText="No current enrolments in the portal."
        pending={pending}
        onManage={setSelected}
        onEnd={setEnding}
      />
      <Section
        title="Past enrolments"
        enrolments={past}
        emptyText="No past enrolments in the portal."
        pending={pending}
        onManage={setSelected}
        onEnd={setEnding}
        muted
      />

      {selected && selected.batch && (
        <ManageAttendanceModal
          studentId={Number(studentId)}
          studentName={studentName}
          enrolment={selected}
          pendingEndDate={pending[selected.studentBatchId] ?? null}
          onClose={() => setSelected(null)}
        />
      )}

      {ending && (
        <ManageInactivationModal
          studentId={Number(studentId)}
          studentName={studentName}
          enrolment={ending}
          pendingEndDate={pending[ending.studentBatchId] ?? null}
          onClose={() => setEnding(null)}
          onChanged={handleChanged}
        />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  scheduleInactivation,
  cancelInactivation,
} from "@/app/lib/inactivation-actions";
import type { EnrolmentView } from "./student-enrolments";

type Props = {
  studentId: number;
  studentName: string;
  enrolment: EnrolmentView;
  // Currently queued end date for this enrolment (YYYY-MM-DD), or null if none.
  pendingEndDate: string | null;
  onClose: () => void;
  // Called after a successful change so the parent can update its row state.
  // endDate = null means the enrolment is no longer queued for inactivation.
  // action distinguishes the three outcomes for callers that need it (the
  // summer responses cell drops the row on an immediate "now" inactivation but
  // keeps it on "cancelled"); the students edit page can ignore it.
  onChanged: (
    studentBatchId: number,
    endDate: string | null,
    action: "now" | "scheduled" | "cancelled",
  ) => void;
};

function ymdToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ManageInactivationModal({
  studentId,
  studentName,
  enrolment,
  pendingEndDate,
  onClose,
  onChanged,
}: Props) {
  const today = ymdToday();
  const [endDate, setEndDate] = useState<string>(pendingEndDate ?? today);
  const [busy, setBusy] = useState<null | "save" | "undo">(null);
  const [error, setError] = useState<string | null>(null);

  const isImmediate = !!endDate && endDate <= today;

  const handleSave = async () => {
    if (!endDate) {
      setError("Pick an end date.");
      return;
    }
    setBusy("save");
    setError(null);
    const res = await scheduleInactivation({
      studentId,
      studentBatchId: enrolment.studentBatchId,
      endDate,
      courseName: enrolment.courseName,
      subCourseCode: enrolment.subCourseCode,
      classDay: enrolment.batch?.day ?? null,
      classStartTime: enrolment.batch?.startTime ?? null,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Applied immediately -> no longer queued; otherwise queued for endDate.
    onChanged(
      enrolment.studentBatchId,
      res.applied === "now" ? null : endDate,
      res.applied,
    );
    onClose();
  };

  const handleUndo = async () => {
    setBusy("undo");
    setError(null);
    const res = await cancelInactivation(enrolment.studentBatchId);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChanged(enrolment.studentBatchId, null, "cancelled");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative flex w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">End enrolment</h2>
            <p className="mt-0.5 truncate text-xs text-gray-600">
              {studentName || `Student ${studentId}`} · {enrolment.courseName}
              {enrolment.subCourseCode ? ` (${enrolment.subCourseCode})` : ""}
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

        <div className="flex flex-col gap-3 p-4">
          <label className="text-sm font-medium text-slate-700">
            End date
            <input
              type="date"
              value={endDate}
              min={today}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </label>

          <p className="text-xs text-slate-500">
            {isImmediate
              ? "This date is today or earlier — the enrolment will be inactivated in the portal right away."
              : "The enrolment stays active until this date, then the daily job inactivates it in the portal. You can change or undo this any time before then."}
          </p>

          {pendingEndDate && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
              Currently scheduled to end on <strong>{pendingEndDate}</strong>.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-3">
          <div>
            {pendingEndDate && (
              <button
                onClick={handleUndo}
                disabled={busy !== null}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === "undo" ? "Undoing…" : "Undo (keep active)"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy !== null}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy !== null}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {busy === "save"
                ? "Saving…"
                : isImmediate
                  ? "Inactivate now"
                  : pendingEndDate
                    ? "Update date"
                    : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

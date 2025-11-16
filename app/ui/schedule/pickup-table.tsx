// app/ui/pickups/pickup-table.tsx
"use client";

import clsx from "clsx";
import { PickupListDisplay } from "@/app/lib/definitions";

type Props = {
  day: PickupListDisplay["weekday"];
  pickups: PickupListDisplay[];
  onMarkAbsence?: (pickupId: string) => void;
  onViewAbsences?: (studentId: string) => void;
  onDelete?: (pickupId: string) => void;
};

export default function PickupTable({
  day,
  pickups,
  onMarkAbsence,
  onViewAbsences,
  onDelete,
}: Props) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 w-full">
      

      <div className="max-h-80 overflow-y-auto">
        {pickups.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No pickups scheduled for this day.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">School</th>
                <th className="px-4 py-2 text-left">Teacher / Room</th>
                <th className="px-4 py-2 text-left">Waiver</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pickups.map((p) => (
                <tr
                  key={p.id}
                  className={clsx(
                    "hover:bg-slate-50 transition-colors",
                    p.absent && "bg-rose-50/60"
                  )}
                >
                  <td className="px-4 py-2 align-middle">
                    <div className="font-medium text-slate-900 truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Student ID: {p.student_id}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="font-medium text-slate-800">
                      {p.school_name}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="text-slate-800 text-sm">
                      {p.teacher_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Room {p.room_number}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        p.waiver_signed
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : "bg-amber-50 text-amber-800 border border-amber-100"
                      )}
                    >
                      {p.waiver_signed ? "Signed" : "Missing"}
                    </span>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        p.absent
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : "bg-sky-50 text-sky-700 border border-sky-100"
                      )}
                    >
                      {p.absent ? "Marked absent" : "Expected"}
                    </span>
                  </td>
                  <td className="px-4 py-2 align-middle text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onMarkAbsence?.(p.id)}
                        className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-60"
                      >
                        Mark absence
                      </button>

                      <button
                        type="button"
                        onClick={() => onViewAbsences?.(p.student_id)}
                        className="inline-flex items-center rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60"
                      >
                        View absences
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete?.(p.id)}
                        className="inline-flex items-center rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

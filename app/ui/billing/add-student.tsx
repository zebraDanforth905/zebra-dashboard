import { fetchUnnassignedStudents } from "@/app/lib/data"; // adjust path
import Search from "@/app/ui/searchStudent"; // your existing search component
import React from "react";
import { assignStudent } from "@/app/lib/actions";

type AssignAction = (formData: FormData) => Promise<void>;

export default async function AddStudentPopup({
  query,
  customer_id,
  title = "Add a student",

}: {
  query: string;
  customer_id: string;
  title?: string;
}) {
  const students = await fetchUnnassignedStudents(query);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="
        rounded-2xl border border-slate-200 bg-white
        shadow-xl shadow-sky-900/10 ring-1 ring-slate-100
        w-[min(28rem,20vw)] p-4 cursor-pointer
      "
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        {/* Optional close button slot; wire in parent via conditional render */}
        {/* <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button> */}
      </div>

      {/* Search */}
      <div className="mb-3">
        <Search placeholder="Search unassigned students..." />
      </div>

      {/* List */}
      <div
        className="
          max-h-50 overflow-auto rounded-xl border border-slate-200
          bg-white
        "
      >
        {students.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No unassigned students found.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.map((s) => (
                <li key={s.id}>
                <form action={assignStudent}>
                    <input name="customer_id" value={customer_id} readOnly hidden />

                    <button
                    type="submit"
                    name="student_id"
                    value={String(s.id)}
                    className="
                        flex w-full items-center justify-between gap-3
                        px-3 py-2 text-left text-sm font-medium text-slate-700
                        hover:bg-sky-50 hover:text-sky-700
                        focus:outline-none focus:ring-2 focus:ring-sky-300
                        rounded-lg transition
                    "
                    >
                    <span>{s.name}</span>
                    <span className="text-xs text-slate-400 group-hover:text-sky-600">
                        Add
                    </span>
                    </button>
                </form>
                </li>
            ))}
            </ul>
        )}
      </div>
    </div>
  );
}
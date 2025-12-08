// app/ui/pickups/pickup-table.tsx
"use client";

import clsx from "clsx";
import { PickupListDisplay } from "@/app/lib/definitions";
import StudentNoteCell from "../students/student-note-cell";
import { useState } from "react";
import { updatePickup } from "@/app/lib/actions";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";

type Props = {
  day: PickupListDisplay["weekday"];
  pickups: PickupListDisplay[];
  currentUserName: string;
  onManageAbsences?: (pickupId: string) => void;
  onDelete?: (pickupId: string) => void;
};

function capitalizeSchoolName(schoolName: string): string {
  return schoolName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default function PickupTable({
  day,
  pickups,
  currentUserName,
  onManageAbsences,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    teacher_name: string;
    room_number: string;
    comment: string;
    waiver_signed: boolean;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = (pickup: PickupListDisplay) => {
    setEditingId(pickup.id);
    setEditForm({
      teacher_name: pickup.teacher_name,
      room_number: pickup.room_number,
      comment: pickup.comment || "",
      waiver_signed: pickup.waiver_signed
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSave = async (pickup: PickupListDisplay) => {
    if (!editForm) return;
    
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("id", pickup.id);
      formData.append("studentId", pickup.student_id);
      formData.append("weekday", pickup.weekday);
      formData.append("school_name", pickup.school_name);
      formData.append("teacher_name", editForm.teacher_name);
      formData.append("room_number", editForm.room_number);
      formData.append("comment", editForm.comment);
      formData.append("waiver_signed", String(editForm.waiver_signed));

      await updatePickup(formData);
      setEditingId(null);
      setEditForm(null);
    } catch (error) {
      console.error("Failed to update pickup:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 w-full overflow-hidden">
      

      <div className="max-h-80 overflow-y-auto overflow-x-auto">
        {pickups.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No pickups scheduled for this day.
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left w-32">Student</th>
                <th className="px-4 py-2 text-left w-28">School</th>
                <th className="px-4 py-2 text-left w-32">Teacher / Room</th>
                <th className="px-4 py-2 text-left w-40">Comment</th>
                <th className="px-4 py-2 text-left w-16">Waiver</th>
                <th className="px-4 py-2 text-left w-20">Status</th>
                <th className="px-4 py-2 text-left w-32">Note</th>
                <th className="px-4 py-2 text-right w-56">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pickups.map((p) => {
                const isEditing = editingId === p.id;
                
                return (
                  <tr
                    key={p.id}
                    className={clsx(
                      "hover:bg-slate-50 transition-colors",
                      p.absent && "bg-rose-50/60",
                      isEditing && "bg-blue-50/30"
                    )}
                  >
                    <td className="px-4 py-2 align-middle">
                      <div className="font-medium text-slate-900 break-words">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500 break-words">
                        Student ID: {p.student_id}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-slate-800 break-words">
                        {capitalizeSchoolName(p.school_name)}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      {isEditing && editForm ? (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={editForm.teacher_name}
                            onChange={(e) => setEditForm({ ...editForm, teacher_name: e.target.value })}
                            className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="Teacher name"
                          />
                          <input
                            type="text"
                            value={editForm.room_number}
                            onChange={(e) => setEditForm({ ...editForm, room_number: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="Room"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="text-slate-800 text-sm break-words">
                            {p.teacher_name}
                          </div>
                          <div className="text-xs text-slate-500 break-words">
                            Room {p.room_number}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {isEditing && editForm ? (
                        <textarea
                          value={editForm.comment}
                          onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                          placeholder="Comment (optional)"
                          rows={2}
                        />
                      ) : p.comment ? (
                        <div className="text-xs text-slate-600 italic break-words">
                          {p.comment}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-middle">
                      {isEditing && editForm ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editForm.waiver_signed}
                            onChange={(e) => setEditForm({ ...editForm, waiver_signed: e.target.checked })}
                            className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-400"
                          />
                          <span className="text-xs text-slate-600">Signed</span>
                        </label>
                      ) : (
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
                      )}
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <span
                        className={clsx(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                          p.absent
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-sky-50 text-sky-700 border border-sky-100"
                        )}
                      >
                        {p.absent ? "Marked absent" : "Expected"}
                      </span>
                    </td>
                    <td className="align-top">
                      <StudentNoteCell 
                        student={{ 
                          id: p.student_id, 
                          name: p.name,
                          recent_note: p.recent_note || null
                        } as any} 
                        currentUserName={currentUserName} 
                      />
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSave(p)}
                              disabled={isSaving}
                              className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60 whitespace-nowrap"
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancel}
                              disabled={isSaving}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60 whitespace-nowrap"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEdit(p)}
                              className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                              title="Edit"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onManageAbsences?.(p.id)}
                              className="inline-flex items-center justify-center rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-60 whitespace-nowrap"
                            >
                              Manage absences
                            </button>

                            <button
                              type="button"
                              onClick={() => onDelete?.(p.id)}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

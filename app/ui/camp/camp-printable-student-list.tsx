'use client';

import { useEffect, useRef, useState } from 'react';
import { updateCampPrintableStudentListOverride } from '@/app/lib/actions';
import type { CampPrintableStudentListField } from '@/app/lib/definitions';

export type CampPrintableStudentListRow = {
  key: string;
  studentId: string;
  studentName: string;
  birthday: string;
  parentSummary: string;
  sessionSummary: string;
  campSummary: string;
  daysSummary: string;
  roomDefault: string;
  medicalAlert: string;
  specialInstruction: string;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type EditableCellProps = {
  field: CampPrintableStudentListField;
  label: string;
  studentId: string;
  value: string;
  weekStart: string;
  weekEnd: string;
  className?: string;
};

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function EditableCell({
  field,
  label,
  studentId,
  value,
  weekStart,
  weekEnd,
  className = '',
}: EditableCellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedValueRef = useRef(value);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    lastSavedValueRef.current = value;
    if (textareaRef.current) {
      textareaRef.current.value = value;
      resizeTextarea(textareaRef.current);
    }
  }, [value]);

  async function saveCell(nextValue: string) {
    if (nextValue === lastSavedValueRef.current) return;

    setStatus('saving');
    setError('');

    const result = await updateCampPrintableStudentListOverride({
      weekStart,
      weekEnd,
      studentId,
      field,
      value: nextValue,
    });

    if (result.ok) {
      lastSavedValueRef.current = nextValue;
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1200);
      return;
    }

    setStatus('error');
    setError(result.error ?? 'Save failed');
  }

  return (
    <div className="print:block">
      <textarea
        ref={textareaRef}
        aria-label={label}
        className={`block min-h-5 w-full resize-none overflow-hidden border-0 bg-transparent p-0 [font:inherit] leading-tight text-inherit outline-none focus:bg-yellow-50 print:overflow-visible print:bg-transparent ${className}`}
        defaultValue={value}
        onBlur={(event) => void saveCell(event.currentTarget.value)}
        onInput={(event) => resizeTextarea(event.currentTarget)}
        rows={Math.max(1, value.split('\n').length)}
      />
      {status !== 'idle' ? (
        <div
          className={`mt-0.5 text-[7px] font-semibold uppercase leading-none print:hidden ${
            status === 'error' ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {status === 'saving' ? 'Saving' : status === 'saved' ? 'Saved' : error}
        </div>
      ) : null}
    </div>
  );
}

export default function CampPrintableStudentList({
  students,
  weekStart,
  weekEnd,
  weekLabel,
}: {
  students: CampPrintableStudentListRow[];
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
}) {
  return (
    <section className="camp-print-packet-page camp-print-student-list-page bg-white text-black">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase text-slate-500">Zebra Robotics</div>
          <h2 className="text-3xl font-bold leading-tight text-slate-950">Student List</h2>
          <p className="text-base font-semibold text-slate-700">Week of {weekLabel}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{students.length}</div>
          <div className="text-xs font-bold uppercase text-slate-500">campers</div>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr className="bg-[#234f8f] text-white">
            <th className="w-[12%] border border-slate-700 p-1 text-[8px] uppercase">Student</th>
            <th className="w-[8%] border border-slate-700 p-1 text-[8px] uppercase">Birthday</th>
            <th className="w-[14%] border border-slate-700 p-1 text-[8px] uppercase">Parent</th>
            <th className="w-[7%] border border-slate-700 p-1 text-[8px] uppercase">Type</th>
            <th className="w-[15%] border border-slate-700 p-1 text-[8px] uppercase">Camp</th>
            <th className="w-[8%] border border-slate-700 p-1 text-[8px] uppercase">Days</th>
            <th className="w-[7%] border border-slate-700 p-1 text-[8px] uppercase">Room</th>
            <th className="w-[15%] border border-slate-700 p-1 text-[8px] uppercase">Allergy / Medical</th>
            <th className="w-[14%] border border-slate-700 p-1 text-[8px] uppercase">Notes</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.key} className="camp-print-student-row align-top">
              <td className="border border-slate-400 p-1 text-[8px] font-bold leading-tight">
                <EditableCell
                  field="student"
                  label={`${student.studentName} student name`}
                  studentId={student.studentId}
                  value={student.studentName}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7.5px] leading-tight">
                <EditableCell
                  field="birthday"
                  label={`${student.studentName} birthday`}
                  studentId={student.studentId}
                  value={student.birthday}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7.5px] leading-tight">
                <EditableCell
                  field="parent"
                  label={`${student.studentName} parent`}
                  studentId={student.studentId}
                  value={student.parentSummary}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7.5px] font-bold leading-tight">
                <EditableCell
                  field="type"
                  label={`${student.studentName} camp type`}
                  studentId={student.studentId}
                  value={student.sessionSummary}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7.5px] leading-tight">
                <EditableCell
                  field="camp"
                  label={`${student.studentName} camp`}
                  studentId={student.studentId}
                  value={student.campSummary}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7.5px] leading-tight">
                <EditableCell
                  field="days"
                  label={`${student.studentName} days`}
                  studentId={student.studentId}
                  value={student.daysSummary}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7.5px] font-bold leading-tight">
                <EditableCell
                  field="room"
                  label={`${student.studentName} room`}
                  studentId={student.studentId}
                  value={student.roomDefault}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7px] leading-tight">
                <EditableCell
                  field="medical"
                  label={`${student.studentName} allergy or medical`}
                  studentId={student.studentId}
                  value={student.medicalAlert}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
              <td className="border border-slate-400 p-1 text-[7px] leading-tight">
                <EditableCell
                  field="notes"
                  label={`${student.studentName} notes`}
                  studentId={student.studentId}
                  value={student.specialInstruction}
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

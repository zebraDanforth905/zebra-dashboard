'use client';

import { useState } from 'react';
import { CampEnrolmentWithStudent } from '@/app/lib/definitions';
import { createSlipsForCampers } from '@/app/lib/actions';
import { CakeIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

const cleanText = (value?: string | null) => value?.trim() || '';

const formatCourseLabel = (enrolment: CampEnrolmentWithStudent) =>
  cleanText(enrolment.course_name) || cleanText(enrolment.course_id);

const formatDOB = (dob: Date | null) => {
  if (!dob) return 'N/A';
  return new Date(dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getCampTypeBadge = (type: 'FD' | 'PM' | 'AM') => {
  const colors = {
    FD: 'bg-blue-100 text-blue-700',
    AM: 'bg-yellow-100 text-yellow-700',
    PM: 'bg-orange-100 text-orange-700',
  };
  const labels = { FD: 'Full Day', AM: 'Morning', PM: 'Afternoon' };
  return { color: colors[type], label: labels[type] };
};

export default function CampWeekSlips({
  weekLabel,
  enrolments,
}: {
  weekLabel: string;
  enrolments: CampEnrolmentWithStudent[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCreatingSlips, setIsCreatingSlips] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(enrolments.map((e) => e.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleCreateSlips = async () => {
    if (selectedIds.size === 0) return;
    setIsCreatingSlips(true);

    const selected = enrolments.filter((e) => selectedIds.has(e.id));
    const result = await createSlipsForCampers(selected);

    if (result.ok) {
      deselectAll();
    } else {
      alert(`Error: ${result.error}`);
    }
    setIsCreatingSlips(false);
  };

  return (
    <div className="mt-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Login Slips</h2>
            <p className="text-sm text-slate-600">
              Select campers to create login slips. Shows every unique student enrolled on any day of {weekLabel}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={selectAll}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition"
            >
              Deselect All
            </button>
            <button
              onClick={handleCreateSlips}
              disabled={selectedIds.size === 0 || isCreatingSlips}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <DocumentTextIcon className="h-4 w-4" />
              {isCreatingSlips ? 'Creating...' : `Create Slips (${selectedIds.size})`}
            </button>
          </div>
        </div>
      </div>

      {enrolments.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-slate-600 text-sm">
          No students enrolled for this week.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {enrolments.map((enrolment) => {
            const isSelected = selectedIds.has(enrolment.id);
            const badge = getCampTypeBadge(enrolment.camp_type);
            const courseLabel = formatCourseLabel(enrolment);

            return (
              <label
                key={enrolment.id}
                className={`relative block cursor-pointer bg-white border rounded-lg p-2 transition-all text-xs ${
                  isSelected ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-sky-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(enrolment.id)}
                  className="absolute top-2 right-2 h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />

                <h3 className="font-semibold text-slate-900 text-sm mb-1 pr-6 truncate">
                  {enrolment.student_name}
                </h3>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[11px] text-slate-600">
                    <CakeIcon className="h-3 w-3" />
                    <span>{formatDOB(enrolment.dob)}</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${badge.color}`}>
                      {badge.label}
                    </span>
                    {enrolment.extended_care && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700">
                        Ext Care
                      </span>
                    )}
                    {courseLabel && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-700">
                        {courseLabel}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

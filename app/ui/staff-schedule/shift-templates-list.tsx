'use client';

import { ShiftTemplateWithAssignments } from '@/app/lib/staff-schedule-types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Props = {
  templates: ShiftTemplateWithAssignments[];
};

export default function ShiftTemplatesList({ templates }: Props) {
  if (templates.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No shift templates found</p>
      </div>
    );
  }

  // Group by weekday
  const groupedByDay = templates.reduce((acc, template) => {
    if (!acc[template.weekday]) {
      acc[template.weekday] = [];
    }
    acc[template.weekday].push(template);
    return acc;
  }, {} as Record<number, ShiftTemplateWithAssignments[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedByDay)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([weekday, dayTemplates]) => (
          <div key={weekday}>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              {WEEKDAYS[Number(weekday)]}
            </h3>
            <div className="space-y-2">
              {dayTemplates.map((template) => (
                <div
                  key={template.id}
                  className="border border-slate-200 rounded-lg p-3 hover:border-sky-300 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">{template.name}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        {template.start_time.substring(0, 5)} - {template.end_time.substring(0, 5)}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {template.shift_type}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {template.assignments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-xs font-medium text-slate-500 mb-1">Assigned Staff:</div>
                      <div className="flex flex-wrap gap-1">
                        {template.assignments.map((assignment) => (
                          <span
                            key={assignment.id}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-sky-100 text-sky-800"
                          >
                            {assignment.staff_name}
                            {assignment.role && ` (${assignment.role})`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

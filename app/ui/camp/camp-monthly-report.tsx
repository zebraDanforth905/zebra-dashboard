'use client';

type MonthReportData = {
  month: string;
  totalEnrolments: number;
  byType: { FD: number; half: number };
  byLength: Record<number, number>;
  byCourse: Record<string, number>;
  uniqueStudentWeeks: number;
};

function HistogramBar({
  label,
  value,
  max,
  color = 'bg-blue-500'
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="w-32 text-right font-medium text-slate-700 truncate" title={label}>{label}</span>
      <div className="h-4 w-40 bg-slate-200 rounded overflow-hidden">
        <div
          className={`${color} h-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-right text-slate-600 font-semibold">{value}</span>
    </div>
  );
}

export default function CampMonthlyReport({
  monthlyReport
}: {
  monthlyReport: MonthReportData[];
}) {
  const formatMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="mb-8 space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Enrollment Summary</h2>
      <div className="space-y-4">
        {monthlyReport.map(rep => {
          const maxLength = Math.max(...Object.values(rep.byLength));
          const maxCourse = Math.max(...Object.values(rep.byCourse));
          const lengthKeys = Object.keys(rep.byLength)
            .map(Number)
            .sort((a, b) => a - b);
          const courseKeys = Object.keys(rep.byCourse).sort();

          return (
            <div
              key={rep.month}
              className="p-5 bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow w-full"
            >
              {/* Header */}
              <h3 className="text-lg font-bold text-slate-900 mb-4">
                {formatMonthName(rep.month)}
              </h3>

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 mb-4 text-center">
                <div className="bg-white rounded border border-slate-200 p-2">
                  <div className="text-2xl font-bold text-blue-600">
                    {rep.totalEnrolments}
                  </div>
                  <div className="text-xs text-slate-600">Total Enrolments (including students enrolled twice for same week)</div>
                </div>
                <div className="bg-white rounded border border-slate-200 p-2">
                  <div className="text-2xl font-bold text-emerald-600">
                    {rep.uniqueStudentWeeks}
                  </div>
                  <div className="text-xs text-slate-600">Students - Deduped (exclude double enrolments)</div>
                </div>
              </div>

              {/* Stats + breakdowns arranged side-by-side */}
              <div className="mb-4 p-3 bg-white rounded border border-slate-200 flex items-start justify-between gap-4 overflow-x-auto">
                {/* Camp type breakdown */}
                <div className="w-56 bg-white border border-slate-200 rounded p-3 pt-2 pb-4 h-56 flex flex-col justify-start">
                  <h4 className="text-sm font-semibold text-slate-900 mb-1 text-center">
                    By Camp Type
                  </h4>
                  <div className="flex flex-col gap-2">
                    <HistogramBar
                      label="Full Day"
                      value={rep.byType.FD}
                      max={rep.totalEnrolments}
                      color="bg-blue-500"
                    />
                    <HistogramBar
                      label="Half Day"
                      value={rep.byType.half}
                      max={rep.totalEnrolments}
                      color="bg-amber-500"
                    />
                  </div>
                </div>

                {/* Session length breakdown */}
                <div className="w-56 bg-white border border-slate-200 rounded p-3 pt-2 pb-4 h-56 flex flex-col justify-start">
                  <h4 className="text-sm font-semibold text-slate-900 mb-1 text-center">
                    By Session Length
                  </h4>
                  <div className="flex flex-col gap-2">
                    {lengthKeys.map(len => (
                      <HistogramBar
                        key={len}
                        label={`${len} Day${len > 1 ? 's' : ''}`}
                        value={rep.byLength[len]}
                        max={maxLength}
                        color="bg-indigo-500"
                      />
                    ))}
                  </div>
                </div>

                {/* Course breakdown */}
                <div className="flex-1 min-w-[300px] bg-white border border-slate-200 rounded p-3 pt-2 pb-4 min-h-56 h-auto flex flex-col justify-start">
                  <h4 className="text-sm font-semibold text-slate-900 mb-1 text-center">
                    By Course
                  </h4>
                  <div className="flex flex-col gap-2">
                    {courseKeys.map(course => (
                      <HistogramBar
                        key={course}
                        label={course}
                        value={rep.byCourse[course]}
                        max={maxCourse}
                        color="bg-green-500"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

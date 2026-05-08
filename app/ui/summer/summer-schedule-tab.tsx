import { SummerScheduleRow } from '@/app/lib/definitions';
import SessionFullToggle from './session-full-toggle';

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function SummerScheduleTab({ rows }: { rows: SummerScheduleRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">
        No summer sessions yet. Flip <code className="text-xs bg-slate-100 px-1 rounded">is_summer=TRUE</code> on sessions to populate this view.
      </div>
    );
  }

  const totalStudents = rows.reduce((sum, r) => sum + r.student_count, 0);
  const totalSessions = rows.length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span><span className="font-semibold text-slate-800">{totalSessions}</span> summer sessions</span>
        <span><span className="font-semibold text-emerald-700">{totalStudents}</span> total enrolments</span>
      </div>

      {/* Session cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(session => (
          <div
            key={session.session_id}
            className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            {/* Session header */}
            <div className={`border-b px-4 py-3 flex items-center justify-between ${
              session.is_full ? 'bg-red-50 border-red-100' : 'bg-sky-50 border-sky-100'
            }`}>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{session.weekday}</p>
                <p className="text-xs text-slate-500">
                  {formatTime(session.start_time)} – {formatTime(session.end_time)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  session.student_count === 0
                    ? 'bg-slate-100 text-slate-400'
                    : 'bg-sky-100 text-sky-700'
                }`}>
                  {session.student_count} student{session.student_count !== 1 ? 's' : ''}
                </span>
                <SessionFullToggle sessionId={session.session_id} isFull={session.is_full} />
              </div>
            </div>

            {/* Student roster */}
            <div className="px-4 py-3">
              {session.students.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No enrolments yet</p>
              ) : (
                <ul className="space-y-1">
                  {session.students.map((s, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{s.name}</span>
                      {s.course && (
                        <span className="text-xs text-slate-400 ml-2 truncate max-w-[100px]">{s.course}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { ParentLinkRow } from '@/app/lib/definitions';

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function csv(val: string): string {
  const s = val ?? '';
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export default function ExportCsvButton({ rows, label = 'Export CSV' }: { rows: ParentLinkRow[]; label?: string }) {
  function handleExport() {
    const origin = window.location.origin;
    const header = 'Full Name,Email Address,Alternate Email,Students,Current Courses,Link';
    const body = rows.map(r => {
      const students = r.student_names.join(', ');
      const courses = r.student_courses
        .map(c => `${c.student_name} — ${c.course_name} ${c.weekday} ${formatTime(c.start_time)}`)
        .join('; ');
      return [
        csv(r.customer_name),
        csv(r.email),
        csv(r.alternate_email ?? ''),
        csv(students),
        csv(courses),
        csv(`${origin}/summer-reg?token=${r.token}`),
      ].join(',');
    });

    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `summer-reg-links-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <button
      onClick={handleExport}
      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
    >
      {label}
    </button>
  );
}

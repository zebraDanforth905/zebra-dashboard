// app/lib/normalize.ts

function pad(n: number) { return n.toString().padStart(2, "0"); }

function toHMS(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = String(input).trim();

  const tryFmt = (parts: RegExpExecArray | null) =>
    parts ? `${pad(+parts[1])}:${pad(+parts[2])}:${pad(+parts[3] || 0)}` : null;

  // 24h HH:MM:SS
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return tryFmt(m);

  // 12h "HH:MM AM/PM"
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(s);
  if (m) {
    let hh = +m[1] % 12;
    if (/pm/i.test(m[4])) hh += 12;
    return `${pad(hh)}:${pad(+m[2])}:${pad(+m[3] || 0)}`;
  }

  return null;
}

export function normalizeRows(rows: any[]) {
  // Produce rows like the python inserter expected:
  // { Day, Times ("HH:MM:SS - HH:MM:SS"), Student ID, Student Name, Course (display), Stream (abbr/code), Trial Date?, Make Up Date? }
  return rows.flatMap((r) => {

    const day = (r.day || "").toString().trim(); // "Monday"
    const start = toHMS(r.start_time);
    const end   = toHMS(r.end_time);
    const full  = (r.student_name).toString().trim()
    const sid   = r.student_id;

    if (!day || !start || !sid || !full) return []; // skip un-usable row

    const courseCode = r.course_abbr || r.sub_course_code;

    // trial / makeup fields if present in source
    const trial  = r.trial_date || "";
    const makeup = r.make_up_date || "";

    return [{
        day: day,
        start_time: start,
        end_time: end,
        student_id: Number(sid),
        name: full,
        course_code: courseCode || "",
        trial_date: trial ? String(trial) : "",
        makeup_date: makeup ? String(makeup) : "",
    }];
  });
}

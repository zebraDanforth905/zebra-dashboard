// app/lib/normalize.ts
import { isSummerDateRange } from './tdsb-calendar';

function pad(n: number) { return n.toString().padStart(2, "0"); }

function toHMS(input: unknown): string | null {
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

type RawEnrolmentRow = {
  day?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  student_name?: unknown;
  student_id?: unknown;
  course_abbr?: unknown;
  sub_course_code?: unknown;
  trial_date?: unknown;
  make_up_date?: unknown;
};

export function normalizeEnrolmentRows(rows: RawEnrolmentRow[]) {
  // Produce rows like the python inserter expected:
  // { Day, Times ("HH:MM:SS - HH:MM:SS"), Student ID, Student Name, Course (display), Stream (abbr/code), Trial Date?, Make Up Date? }
  return rows.flatMap((r) => {

    const day = (r.day || "").toString().trim(); // "Monday"
    const start_date = (r.start_date || "").toString().trim(); // "YYYY-MM-DD"
    const end_date = (r.end_date ? r.end_date.toString().trim() : null);     // "YYYY-MM-DD"
    const start = toHMS(r.start_time);
    const end   = toHMS(r.end_time);
    const full  = (r.student_name ?? "").toString().trim()
    const sid   = r.student_id;

    if (!day || !start || !end || !sid || !full) return []; // skip un-usable row

    const courseCode = r.course_abbr || r.sub_course_code;

    // trial / makeup fields if present in source
    const trial  = r.trial_date || "";
    const makeup = r.make_up_date || "";

    const effectiveStartDate = trial || makeup || start_date;
    const effectiveEndDate = trial || makeup || end_date;

    return [{
        day: day,
        start_date: start_date,
        end_date: end_date,
        start_time: start,
        end_time: end,
        student_id: Number(sid),
        name: full,
        course_code: courseCode ? String(courseCode) : "",
        trial_date: trial ? String(trial) : "",
        makeup_date: makeup ? String(makeup) : "",
        is_summer: isSummerDateRange(effectiveStartDate, effectiveEndDate),
    }];
  });
}


// normalize_absences.ts
type RawAttendance = {
  date: string; // "YYYY-MM-DD"
  attendance_value: string; // "Absent", "Present", ...
  student: { user_id: number; firstname: string; lastname: string };
  batch: { day: string; start_time: string; end_time: string };
};

export type NormalizedAbsence = {
  student_id: number;       // -> enrolments.student_id
  weekday: string;          // sessions.weekday
  start_time: string;       // sessions.start_time
  end_time: string;         // sessions.end_time
  date: string;             // 'YYYY-MM-DD'
  is_absent: boolean;
};

export function normalizeAbsencesFromAttendance(results: RawAttendance[]): NormalizedAbsence[] {
  console.log("normalizing attendance")
  
  return results
    .filter(r => r.date && r.student?.user_id && r.batch?.day && r.batch?.start_time && r.batch?.end_time)
    .map(r => ({
      student_id: r.student.user_id,
      weekday: r.batch.day,
      start_time: r.batch.start_time,
      end_time: r.batch.end_time,
      date: r.date,
      is_absent: r.attendance_value === "Absent",
    }));
}

// ── Customer extraction ──────────────────────────────────────────────────────

export type PortalCustomerRow = {
  portal_parent_id: number;
  name: string;
  email: string;
  alternate_email: string | null;
  student_ids: number[];
};

// Portal sends alternate_emails as a plain email string (or comma-separated emails).
// No name is ever included — extract the first valid email that differs from primary.
function extractAltEmail(raw: string, primaryEmail: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const primary = primaryEmail.trim().toLowerCase();
  // Handle "Name <email>" just in case, then fall back to plain/comma-separated
  const angleMatch = s.match(/<([^>@\s]+@[^>]+)>/);
  const candidate = angleMatch
    ? angleMatch[1].trim().toLowerCase()
    : s.split(/[,;]/).map(x => x.trim()).find(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))?.toLowerCase() ?? null;
  if (!candidate || candidate === primary) return null;
  return candidate;
}

// Extracts unique parent/customer records from raw portal rows.
// Works for both class-report rows and camp-report rows.
// Returns an empty array if the rows have no parent fields.
type RawCustomerSourceRow = {
  parent_id?: number | string | null;
  customer_id?: number | string | null;
  parent_name?: unknown;
  customer_name?: unknown;
  guardian_name?: unknown;
  email?: unknown;
  parent_email?: unknown;
  student_id?: number | string | null;
  alternate_emails?: unknown;
  alternate_email?: unknown;
};

export function extractCustomerRows(rawRows: RawCustomerSourceRow[]): PortalCustomerRow[] {
  const map = new Map<number, PortalCustomerRow>();

  for (const r of rawRows) {
    const rawParentId = r.parent_id ?? r.customer_id ?? null;
    const parentId: number | null = rawParentId != null ? Number(rawParentId) : null;
    const parentName: string = (r.parent_name ?? r.customer_name ?? r.guardian_name ?? '').toString().trim();
    const email: string = (r.email ?? r.parent_email ?? '').toString().trim().toLowerCase();
    const studentId: number | null = r.student_id != null ? Number(r.student_id) : null;

    if (!parentId || !email) continue;

    const altEmail = extractAltEmail(
      (r.alternate_emails ?? r.alternate_email ?? '').toString(),
      email,
    );

    if (map.has(parentId)) {
      const existing = map.get(parentId)!;
      if (studentId != null && !existing.student_ids.includes(studentId)) {
        existing.student_ids.push(studentId);
      }
      if (!existing.alternate_email && altEmail) existing.alternate_email = altEmail;
    } else {
      map.set(parentId, {
        portal_parent_id: parentId,
        name: parentName,
        email,
        alternate_email: altEmail,
        student_ids: studentId != null ? [studentId] : [],
      });
    }
  }

  return Array.from(map.values());
}

// normalize_camp.ts
type RawCampEnrolment = {
  delivery_type: string;
  program_type: string;
  camp_week: string;        // "Jan 16, 2026 - Jan 16, 2026"
  camp_type: string;        // "FD" | "FD-EX" | "HD-PM" | "HD-PM-EX" | "HD-AM"
  camp_times: string;       // "08:30:00 - 16:00:00"
  course_abbr: string;
  student_id: number;
  student_name: string;
  phone: string;
  parent_id: number;
  email: string;
  parent_name: string;
  course_status: string;
  alternate_emails: string;
  dob: string;
  allergies: string;
  special_need: string;
};

export type NormalizedCampEnrolment = {
  student_id: number;
  student_name: string;
  dob: string;              // "YYYY-MM-DD"
  parent_name: string;
  parent_phone: string;
  start_date: string;       // "YYYY-MM-DD"
  end_date: string;         // "YYYY-MM-DD"
  start_time: string;       // "HH:MM:SS"
  end_time: string;         // "HH:MM:SS"
  camp_type: 'FD' | 'PM' | 'AM';
  extended_care: boolean;
  allergies: string;
  special_needs: string;
  course_id: string;        // course_abbr
};

function parseCampWeek(campWeek: string): { start: string; end: string } | null {
  // "Jan 16, 2026 - Jan 16, 2026" or "Jan 16, 2026 - Jan 17, 2026"
  const match = campWeek.match(/([A-Za-z]+)\s+(\d+),\s+(\d{4})\s*-\s*([A-Za-z]+)\s+(\d+),\s+(\d{4})/);
  if (!match) return null;

  const [, startMonth, startDay, startYear, endMonth, endDay, endYear] = match;
  
  const monthMap: { [key: string]: string } = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  
  const startMonthNum = monthMap[startMonth.toLowerCase().slice(0, 3)];
  const endMonthNum = monthMap[endMonth.toLowerCase().slice(0, 3)];
  
  if (!startMonthNum || !endMonthNum) return null;
  
  return {
    start: `${startYear}-${startMonthNum}-${startDay.padStart(2, '0')}`,
    end: `${endYear}-${endMonthNum}-${endDay.padStart(2, '0')}`
  };
}

function parseCampTimes(campTimes: string): { start: string; end: string } | null {
  // "08:30:00 - 16:00:00"
  const match = campTimes.match(/([\d:]+)\s*-\s*([\d:]+)/);
  if (!match) return null;
  
  return {
    start: match[1].trim(),
    end: match[2].trim()
  };
}

function parseCampType(campType: string): 'FD' | 'PM' | 'AM' | null {
  // Map various camp_type strings to 'FD', 'PM', or 'AM'
  const typeMap: { [key: string]: 'FD' | 'PM' | 'AM' } = {
    "FD": "FD",
    "FD-EX": "FD",
    "HD-PM": "PM",
    "HD-PM-EX": "PM",
    "HD-AM": "AM"
  };

  return typeMap[campType] || null;
}

export function normalizeCampEnrolments(results: RawCampEnrolment[]): NormalizedCampEnrolment[] {
  console.log("normalizing camp enrolments");
  
  return results
    .filter(r => r.course_status === "Active")
    .map(r => {
      const dates = parseCampWeek(r.camp_week);
      const times = parseCampTimes(r.camp_times);
      
      if (!dates || !times) {
        console.warn(`Skipping invalid camp enrolment for student ${r.student_id}:`, { camp_week: r.camp_week, camp_times: r.camp_times });
        return null;
      }
      
      // Extended care is typically before 9am or after 4pm
      const startHour = parseInt(times.start.split(':')[0]);
      const endHour = parseInt(times.end.split(':')[0]);
      const extended_care = r.camp_type.endsWith('-EX');
      
      return {
        student_id: r.student_id,
        student_name: r.student_name,
        dob: r.dob || '',
        parent_name: r.parent_name || '',
        parent_phone: r.phone || '',
        start_date: dates.start,
        end_date: dates.end,
        start_time: times.start,
        end_time: times.end,
        camp_type: parseCampType(r.camp_type) as 'FD' | 'PM' | 'AM',
        extended_care,
        allergies: r.allergies || '',
        special_needs: r.special_need || '',
        course_id: r.course_abbr || ''
      };
    })
    .filter((r): r is NormalizedCampEnrolment => r !== null);
}

// TDSB academic calendar boundaries + holiday/break dates Zebra observes.
//
// Used by the parent summer-reg form to constrain the per-session start-date
// picker so families only see dates that are real class days.
//
// **Edit these constants when the new TDSB year is published.** Last verified
// against the 2025-2026 TDSB calendar; 2026-2027 dates are best-effort and
// should be confirmed before the fall send.

export type WeekdayName =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday'
  | 'Friday' | 'Saturday' | 'Sunday';

export type TermKey = 'summer' | 'fall';

const WEEKDAY_INDEX: Record<WeekdayName, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// Inclusive on both ends. ISO YYYY-MM-DD.
const TERMS: Record<TermKey, { start: string; end: string }> = {
  // Summer 2026: Mon after TDSB last day → Fri before Labor Day weekend.
  summer: { start: '2026-06-29', end: '2026-09-04' },
  // Fall 2026: Tue after Labor Day → Fri before TDSB winter break.
  fall:   { start: '2026-09-08', end: '2026-12-18' },
};

// Dates Zebra is closed (stat holidays + extended breaks). Anything in this
// list is removed from the picker. PA days are NOT in this list because Zebra
// usually still runs classes — adjust if that changes.
const CLOSED_DATES: ReadonlySet<string> = new Set<string>([
  // Summer 2026
  '2026-07-01', // Canada Day
  '2026-08-03', // Civic Holiday (Simcoe Day)

  // Fall 2026 — winter break (Zebra closed Dec 21 → Jan 2)
  '2026-10-12', // Thanksgiving
  '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25',
  '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
  '2027-01-01',
]);

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function* dateRange(startISO: string, endISO: string): Generator<Date> {
  const end = fromISO(endISO);
  for (const cur = fromISO(startISO); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    yield new Date(cur);
  }
}

export function getStartDateOptions(weekday: WeekdayName, term: TermKey): string[] {
  const { start, end } = TERMS[term];
  const target = WEEKDAY_INDEX[weekday];
  const out: string[] = [];
  for (const d of dateRange(start, end)) {
    if (d.getUTCDay() !== target) continue;
    const iso = toISO(d);
    if (CLOSED_DATES.has(iso)) continue;
    out.push(iso);
  }
  return out;
}

export function formatStartDate(iso: string): string {
  const d = fromISO(iso);
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

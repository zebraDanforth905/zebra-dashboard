export const generatePagination = (currentPage: number, totalPages: number) => {
  // If total pages is less than 7, display all pages
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // If current page is among the first 3 pages
  if (currentPage <= 3) {
    return [1, 2, 3, '...', totalPages - 1, totalPages];
  }

  // If current page is among the last 3 pages
  if (currentPage >= totalPages - 2) {
    return [1, 2, '...', totalPages - 2, totalPages - 1, totalPages];
  }

  // If current page is somewhere in the middle
  return [
    1,
    '...',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    '...',
    totalPages,
  ];
};



// utils/recurring.ts
export function computeNextDate(opts: {
  startDate: Date;    // any date
  dayOfMonth: number; // 1..28 or -1 (last day)
  every: number;      // 1=monthly, 2=every 2 months, ...
}): Date {
  const { startDate, dayOfMonth, every } = opts;

  // Truncate to UTC date (00:00Z)
  const startUTC = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate()
  ));

  const lastDayOfUTC = (y: number, m: number) =>
    new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const pickUTC = (y: number, m: number) => {
    const last = lastDayOfUTC(y, m);
    const d = dayOfMonth === -1 ? last : Math.min(dayOfMonth, last);
    return new Date(Date.UTC(y, m, d)); // 00:00Z on that calendar day
  };

  let y = startUTC.getUTCFullYear();
  let m = startUTC.getUTCMonth();
  let candidate = pickUTC(y, m);

  // STRICTLY after start date (>) — if equal, jump ahead.
  while (candidate <= startUTC) {
    m += every;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    candidate = pickUTC(y, m);
  }

  return candidate; // UTC midnight on the correct next calendar day
}

export function formatDate(d: Date | string, locale = "en-CA") {
    const date = typeof d === "string" ? new Date(d) : d;
    // Force UTC so midnight dates don’t move to the previous day locally
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        timeZone: "UTC",
    }).format(date);
}

export function localMidnightFromISODate(isoYmd: string) {
  const [y, m, d] = isoYmd.split('-').map(Number);
  return new Date(y, m - 1, d); // local tz midnight
}

// utils.ts
export const ymd = (d: string | Date) =>
  typeof d === "string" ? d : d.toISOString().slice(0, 10);

export function assertAligned(label: string, arrays: Record<string, any[]>) {
  const lens = Object.values(arrays).map(a => a.length);
  const same = lens.every(n => n === lens[0]);
  if (!same) throw new Error(`${label}: unaligned arrays ${JSON.stringify(lens)}`);
  for (const [k, a] of Object.entries(arrays)) {
    const bad = a.findIndex(v => v === undefined);
    if (bad !== -1) throw new Error(`${label}: ${k}[${bad}] is undefined`);
  }
}

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;
type Weekday = typeof WEEKDAYS[number];
export function nextOccurrenceOf(weekday: Weekday, from = new Date()): Date {
  const targetIdx = WEEKDAYS.indexOf(weekday);
  const fromIdx = from.getDay();
  let delta = (targetIdx - fromIdx + 7) % 7;
  const dt = new Date(from);  // clone
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() + delta);
  return dt;
}
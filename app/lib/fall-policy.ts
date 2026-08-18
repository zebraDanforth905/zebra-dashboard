// Fall confirmation flow policy constants.
// Update FALL_TERM_START_DATE each year — it is only the default prefill for the
// parent-chosen start date, so a stale value is correctable per family on the form.
export const FALL_TERM_START_DATE = '2026-09-08';

/**
 * First date on or after FALL_TERM_START_DATE that falls on the slot's weekday.
 *
 * A blanket term-start default put a Saturday class's first day on a Tuesday. Parents
 * would either not notice — leaving staff to enrol from a date with no class — or have
 * to correct every row by hand.
 */
export function firstClassDateFor(weekday: string, termStart = FALL_TERM_START_DATE): string {
  const target = weekdayIndex(weekday);
  if (target >= WEEKDAY_ORDER.length) return termStart;

  const date = new Date(`${termStart}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return termStart;

  // JS getUTCDay(): 0 = Sunday. WEEKDAY_ORDER is Monday-first.
  const currentIndex = (date.getUTCDay() + 6) % 7;
  const delta = (target - currentIndex + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export const FALL_PICKUP_SCHOOLS = ['Jackman', 'Frankland'] as const;

export type FallCatalogueSlot = {
  weekday: string;
  start_time: string;
  end_time: string;
};

/**
 * The fall class times we offer, hard-coded on purpose.
 *
 * These CANNOT be read from the sessions table: the nightly portal scrape deletes every
 * non-summer session with no enrolments, trials, or makeups (see insert_from_portal.ts),
 * so an unbooked slot disappears within a day. Deriving the offered list from that table
 * meant a slot nobody was in became invisible, and therefore unbookable — nothing could
 * ever be the first enrolment in a class.
 *
 * A session row is created on demand when staff actually enrol someone into a slot.
 */
export const FALL_CATALOGUE_SLOTS: FallCatalogueSlot[] = [
  // Monday–Thursday: 4–5, 5–6, 6–7
  { weekday: 'Monday', start_time: '16:00:00', end_time: '17:00:00' },
  { weekday: 'Monday', start_time: '17:00:00', end_time: '18:00:00' },
  { weekday: 'Monday', start_time: '18:00:00', end_time: '19:00:00' },
  { weekday: 'Tuesday', start_time: '16:00:00', end_time: '17:00:00' },
  { weekday: 'Tuesday', start_time: '17:00:00', end_time: '18:00:00' },
  { weekday: 'Tuesday', start_time: '18:00:00', end_time: '19:00:00' },
  { weekday: 'Wednesday', start_time: '16:00:00', end_time: '17:00:00' },
  { weekday: 'Wednesday', start_time: '17:00:00', end_time: '18:00:00' },
  { weekday: 'Wednesday', start_time: '18:00:00', end_time: '19:00:00' },
  { weekday: 'Thursday', start_time: '16:00:00', end_time: '17:00:00' },
  { weekday: 'Thursday', start_time: '17:00:00', end_time: '18:00:00' },
  { weekday: 'Thursday', start_time: '18:00:00', end_time: '19:00:00' },
  // Friday runs only until 6
  { weekday: 'Friday', start_time: '16:00:00', end_time: '17:00:00' },
  { weekday: 'Friday', start_time: '17:00:00', end_time: '18:00:00' },
  // Saturday
  { weekday: 'Saturday', start_time: '09:00:00', end_time: '10:00:00' },
  { weekday: 'Saturday', start_time: '10:00:00', end_time: '11:00:00' },
  { weekday: 'Saturday', start_time: '11:00:00', end_time: '12:00:00' },
  { weekday: 'Saturday', start_time: '12:00:00', end_time: '13:00:00' },
  { weekday: 'Saturday', start_time: '13:00:00', end_time: '14:00:00' },
  // Sunday
  { weekday: 'Sunday', start_time: '10:00:00', end_time: '11:00:00' },
  { weekday: 'Sunday', start_time: '11:00:00', end_time: '12:00:00' },
];

export const WEEKDAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function weekdayIndex(weekday: string): number {
  const i = WEEKDAY_ORDER.indexOf(weekday.trim().toLowerCase());
  return i === -1 ? WEEKDAY_ORDER.length : i;
}

export function slotKey(weekday: string, startTime: string): string {
  return `${weekday}|${startTime}`;
}

const CATALOGUE_BY_KEY = new Map(
  FALL_CATALOGUE_SLOTS.map(slot => [slotKey(slot.weekday, slot.start_time), slot]),
);

export function isCatalogueSlot(weekday: string, startTime: string): boolean {
  return CATALOGUE_BY_KEY.has(slotKey(weekday, startTime));
}

/** Fall back to a one-hour class when a student's own slot has no known end time. */
export function assumedEndTime(startTime: string): string {
  const [h, m, s] = startTime.split(':').map(Number);
  if (!Number.isFinite(h)) return startTime;
  const end = new Date(Date.UTC(2000, 0, 1, h, m || 0, s || 0));
  end.setUTCHours(end.getUTCHours() + 1);
  return [end.getUTCHours(), end.getUTCMinutes(), end.getUTCSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':');
}

export function catalogueEndTime(weekday: string, startTime: string): string {
  return CATALOGUE_BY_KEY.get(slotKey(weekday, startTime))?.end_time ?? assumedEndTime(startTime);
}

const FALL_WEEKDAY_HOURS = new Set([16, 17, 18]); // 4, 5, 6 PM
const FALL_SATURDAY_HOURS = new Set([9, 10, 11, 13]); // 9, 10, 11 AM, 1 PM

/**
 * Which existing fall session rows the SUMMER registration form offers. Still reads the
 * sessions table — see FALL_CATALOGUE_SLOTS for why the fall confirmation form does not.
 */
export function isVisibleFallSession(session: {
  weekday: string;
  start_time: string;
  student_count?: number;
}): boolean {
  const [hour, minute] = session.start_time.split(':').map(Number);

  if (session.weekday === 'Saturday') {
    if (minute !== 0) return false;
    return FALL_SATURDAY_HOURS.has(hour);
  }

  if (session.weekday === 'Sunday') {
    if (hour === 10 && minute === 30) return false;
    if ((session.student_count ?? 0) > 0) return true;
    if (minute !== 0) return false;
    return hour !== 12;
  }

  if (minute !== 0) return false;
  return FALL_WEEKDAY_HOURS.has(hour);
}

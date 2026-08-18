// Fall confirmation flow policy constants.
// Update FALL_TERM_START_DATE each year — it is only the default prefill for the
// parent-chosen start date, so a stale value is correctable per family on the form.
export const FALL_TERM_START_DATE = '2026-09-08';

export const FALL_PICKUP_SCHOOLS = ['Jackman', 'Frankland'] as const;

const FALL_WEEKDAY_HOURS = new Set([16, 17, 18]); // 4, 5, 6 PM
const FALL_SATURDAY_HOURS = new Set([9, 10, 11, 13]); // 9, 10, 11 AM, 1 PM

/**
 * Which fall sessions parents are offered. Shared by the summer registration form
 * (fetchParentFormData) and the fall confirmation form (fetchFallFormData) so the two
 * always present the same list — a slot offered in one must be offerable in the other.
 *
 * Note this is the offered list only. A student's *current* session is always selectable
 * on the fall form even when it falls outside these hours, so "keep what we have" works
 * for families in non-standard slots.
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

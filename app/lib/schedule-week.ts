import { getTermRange, isSummerDateRange } from './tdsb-calendar';

export const SCHEDULE_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type ScheduleWeekday = (typeof SCHEDULE_DAYS)[number];

export function ymdLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseYmdLocal(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function startOfScheduleWeek(input?: string | Date | null): Date {
  const date =
    typeof input === 'string'
      ? parseYmdLocal(input) ?? new Date()
      : input
        ? new Date(input)
        : new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return date;
}

export function endOfScheduleWeek(input?: string | Date | null): Date {
  const end = startOfScheduleWeek(input);
  end.setDate(end.getDate() + 6);
  return end;
}

export function dateForScheduleWeekday(weekStart: string | Date, weekday: ScheduleWeekday): Date {
  const date = startOfScheduleWeek(weekStart);
  date.setDate(date.getDate() + SCHEDULE_DAYS.indexOf(weekday));
  return date;
}

export function isSummerScheduleWeek(weekStart: string | Date): boolean {
  const start = startOfScheduleWeek(weekStart);
  const end = endOfScheduleWeek(start);
  return isSummerDateRange(ymdLocal(start), ymdLocal(end));
}

export function summerScheduleWeekNumber(weekStart: string | Date): number | null {
  const summer = getTermRange('summer');
  const summerStart = startOfScheduleWeek(summer.start);
  const summerEnd = startOfScheduleWeek(summer.end);
  const selectedStart = startOfScheduleWeek(weekStart);

  if (selectedStart < summerStart || selectedStart > summerEnd) return null;

  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((selectedStart.getTime() - summerStart.getTime()) / millisecondsPerWeek) + 1;
}

export function formatScheduleWeekRange(weekStart: string | Date): string {
  const start = startOfScheduleWeek(weekStart);
  const end = endOfScheduleWeek(start);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

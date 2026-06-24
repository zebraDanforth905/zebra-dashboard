import {
  BillingCalendarCell,
  BillingCalendarDateStatus,
  BillingCalendarMonth,
  BillingCalendarWeekday,
} from '@/app/lib/definitions';

export const billingCalendarSource = {
  spreadsheetTitle: '2026 Staff Schedule',
  sheetName: 'Billing Calendar',
  url: 'https://docs.google.com/spreadsheets/d/1DUEIIvFXlYR0NV1eahRpPjdG_vIXcg9pNUZOIEq1xe4/edit',
  copiedAt: '2026-06-02',
};

export const billingCalendarWeekdays: BillingCalendarWeekday[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

function cell(copy = ''): BillingCalendarCell {
  const sections = copy
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    classes: sections[0] ?? '',
    notes: sections.slice(1),
  };
}

function month(
  year: number,
  monthName: string,
  days: Record<BillingCalendarWeekday, string>,
  convergeMessage?: string,
): BillingCalendarMonth {
  return {
    id: `${year}-${monthName.toLowerCase().replace(/\s+/g, '-')}`,
    year,
    month: monthName.trim(),
    convergeMessage,
    days: {
      Mon: cell(days.Mon),
      Tue: cell(days.Tue),
      Wed: cell(days.Wed),
      Thu: cell(days.Thu),
      Fri: cell(days.Fri),
      Sat: cell(days.Sat),
      Sun: cell(days.Sun),
    },
  };
}

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const weekdayIndexes: Record<BillingCalendarWeekday, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
};

type DateRange = {
  start: Date;
  end: Date;
  source: 'official' | 'estimated';
};

type ClosurePolicy = 'makeup-if-needed' | 'no-makeup';

type Closure = {
  reason: string;
  policy: ClosurePolicy;
  source?: 'official' | 'estimated';
};

type GeneratedCellPlan = {
  dates: Date[];
  notes: string[];
  statuses: Record<string, BillingCalendarDateStatus>;
  openDates: Date[];
  noMakeupClosures: number;
  needsMakeupClosures: number;
};

function dateAt(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateId(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function dateStatusKey(date: Date): string {
  return `${monthNames[date.getUTCMonth()].toLowerCase()}-${date.getUTCDate()}`;
}

function formatBillingDate(date: Date): string {
  return `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function compareDates(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function sameDate(left: Date, right: Date): boolean {
  return dateId(left) === dateId(right);
}

function isInRange(date: Date, range: DateRange): boolean {
  return compareDates(date, range.start) >= 0 && compareDates(date, range.end) <= 0;
}

function datesForWeekday(year: number, monthIndex: number, weekday: BillingCalendarWeekday): Date[] {
  const target = weekdayIndexes[weekday];
  const dates: Date[] = [];

  for (let day = 1; day <= 31; day += 1) {
    const date = dateAt(year, monthIndex, day);
    if (date.getUTCMonth() !== monthIndex) break;
    if (date.getUTCDay() === target) dates.push(date);
  }

  return dates;
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekdayIndex: number,
  occurrence: number,
): Date {
  const first = dateAt(year, monthIndex, 1);
  const offset = (weekdayIndex - first.getUTCDay() + 7) % 7;
  return dateAt(year, monthIndex, 1 + offset + (occurrence - 1) * 7);
}

function weekdayOnOrBefore(
  year: number,
  monthIndex: number,
  day: number,
  weekdayIndex: number,
): Date {
  const date = dateAt(year, monthIndex, day);
  const offset = (date.getUTCDay() - weekdayIndex + 7) % 7;
  return addDays(date, -offset);
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthIndex = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return dateAt(year, monthIndex, day);
}

function marchBreakRange(year: number): DateRange {
  const known: Record<number, DateRange> = {
    2027: { start: dateAt(2027, 2, 15), end: dateAt(2027, 2, 19), source: 'official' },
    2028: { start: dateAt(2028, 2, 13), end: dateAt(2028, 2, 17), source: 'official' },
    2029: { start: dateAt(2029, 2, 12), end: dateAt(2029, 2, 16), source: 'official' },
  };

  if (known[year]) return known[year];

  const start = weekdayOnOrBefore(year, 2, 17, 1);
  return { start, end: addDays(start, 4), source: 'estimated' };
}

function winterBreakRange(schoolYearStart: number): DateRange {
  const known: Record<number, DateRange> = {
    2026: { start: dateAt(2026, 11, 21), end: dateAt(2027, 0, 3), source: 'official' },
    2027: { start: dateAt(2027, 11, 20), end: dateAt(2028, 0, 2), source: 'official' },
    2028: { start: dateAt(2028, 11, 25), end: dateAt(2029, 0, 7), source: 'official' },
  };

  if (known[schoolYearStart]) return known[schoolYearStart];

  const start = weekdayOnOrBefore(schoolYearStart, 11, 25, 1);
  return { start, end: addDays(start, 13), source: 'estimated' };
}

function estimatedFirstSchoolDay(year: number): Date {
  const labourDay = nthWeekdayOfMonth(year, 8, 1, 1);
  return addDays(labourDay, 1);
}

function requiredClosureForDate(date: Date): Closure | null {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();
  const easter = easterSunday(year);
  const familyDay = nthWeekdayOfMonth(year, 1, 1, 3);
  const victoriaDay = weekdayOnOrBefore(year, 4, 24, 1);
  const civicDay = nthWeekdayOfMonth(year, 7, 1, 1);
  const labourDay = nthWeekdayOfMonth(year, 8, 1, 1);
  const thanksgiving = nthWeekdayOfMonth(year, 9, 1, 2);
  const schoolYearStart = monthIndex === 0 ? year - 1 : year;
  const winterBreak = winterBreakRange(schoolYearStart);
  const marchBreak = marchBreakRange(year);
  const firstSchoolDay = estimatedFirstSchoolDay(year);

  if (monthIndex === 0 && day === 1) {
    return { reason: "New Year's Day closure", policy: 'makeup-if-needed' };
  }

  if (sameDate(date, familyDay)) {
    return { reason: 'Family Day closure', policy: 'makeup-if-needed' };
  }

  if (isInRange(date, marchBreak) && date.getUTCDay() >= 1 && date.getUTCDay() <= 5) {
    return {
      reason: `TDSB March Break closure${marchBreak.source === 'estimated' ? ' (estimated)' : ''}`,
      policy: 'makeup-if-needed',
      source: marchBreak.source,
    };
  }

  if (sameDate(date, addDays(easter, -2))) {
    return { reason: 'Good Friday closure', policy: 'makeup-if-needed' };
  }

  if (sameDate(date, easter)) {
    return { reason: 'Easter Sunday closure', policy: 'makeup-if-needed' };
  }

  if (sameDate(date, addDays(easter, 1))) {
    return { reason: 'Easter Monday closure', policy: 'makeup-if-needed' };
  }

  if (sameDate(date, victoriaDay)) {
    return { reason: 'Victoria Day closure', policy: 'makeup-if-needed' };
  }

  if (monthIndex === 6 && day === 1) {
    return { reason: 'Canada Day closure', policy: 'no-makeup' };
  }

  if (sameDate(date, civicDay)) {
    return { reason: 'Civic Day closure', policy: 'no-makeup' };
  }

  if (monthIndex === 8 && compareDates(date, firstSchoolDay) < 0) {
    return { reason: 'Summer break before school starts (estimated TDSB start)', policy: 'no-makeup', source: 'estimated' };
  }

  if (sameDate(date, labourDay)) {
    return { reason: 'Labour Day closure', policy: 'makeup-if-needed' };
  }

  if (sameDate(date, thanksgiving)) {
    return { reason: 'Thanksgiving closure', policy: 'makeup-if-needed' };
  }

  if (monthIndex === 9 && day === 31 && date.getUTCDay() >= 1 && date.getUTCDay() <= 5) {
    return { reason: 'Halloween evening closure', policy: 'no-makeup' };
  }

  if (isInRange(date, winterBreak) && (monthIndex === 0 || day >= 23)) {
    return {
      reason: `Winter break closure${winterBreak.source === 'estimated' ? ' (estimated)' : ''}`,
      policy: 'makeup-if-needed',
      source: winterBreak.source,
    };
  }

  if (monthIndex === 11 && day === 25) {
    return { reason: 'Christmas Day closure', policy: 'makeup-if-needed' };
  }

  if (monthIndex === 11 && day === 26) {
    return { reason: 'Boxing Day closure', policy: 'makeup-if-needed' };
  }

  return null;
}

function optionalLongWeekendClosureForDate(date: Date, openCountBeforeOptional: number): Closure | null {
  const year = date.getUTCFullYear();
  const easter = easterSunday(year);
  const victoriaDay = weekdayOnOrBefore(year, 4, 24, 1);
  const civicDay = nthWeekdayOfMonth(year, 7, 1, 1);
  const labourDay = nthWeekdayOfMonth(year, 8, 1, 1);
  const canadaDay = dateAt(year, 6, 1);

  if (sameDate(date, addDays(easter, -1)) && openCountBeforeOptional > 4) {
    return { reason: 'Easter long weekend closure', policy: 'makeup-if-needed' };
  }

  if ((sameDate(date, addDays(victoriaDay, -2)) || sameDate(date, addDays(victoriaDay, -1))) && openCountBeforeOptional > 4) {
    return { reason: 'Victoria Day long weekend closure', policy: 'makeup-if-needed' };
  }

  if (sameDate(date, addDays(canadaDay, -2)) || sameDate(date, addDays(canadaDay, -1))) {
    return { reason: 'Canada Day long weekend closure', policy: 'no-makeup' };
  }

  if (sameDate(date, addDays(civicDay, -2)) || sameDate(date, addDays(civicDay, -1))) {
    return { reason: 'Civic Day long weekend closure', policy: 'no-makeup' };
  }

  if (sameDate(date, addDays(labourDay, -2)) || sameDate(date, addDays(labourDay, -1))) {
    return { reason: 'Labour Day long weekend closure', policy: 'no-makeup' };
  }

  return null;
}

function createGeneratedCell(plan: GeneratedCellPlan): BillingCalendarCell {
  const sortedDates = [...plan.dates].sort(compareDates);

  return {
    classes: sortedDates.map(formatBillingDate).join(', '),
    notes: plan.notes,
    dateStatuses: plan.statuses,
  };
}

function annotateMove(
  from: GeneratedCellPlan,
  to: GeneratedCellPlan,
  date: Date,
  toMonthName: string,
): void {
  const key = dateStatusKey(date);

  from.statuses[key] = 'moved-out';
  to.statuses[key] = 'moved-in';

  from.notes.push(`${formatBillingDate(date)}: Move to ${toMonthName} billing to keep four billed classes.`);
  to.notes.push(`${formatBillingDate(date)}: Pulled in from ${monthNames[date.getUTCMonth()]} billing to keep four billed classes.`);
  to.dates.push(date);
}

function buildWeekdayPlans(
  year: number,
  weekday: BillingCalendarWeekday,
): Record<number, GeneratedCellPlan> {
  const plans: Record<number, GeneratedCellPlan> = {};

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const dates = datesForWeekday(year, monthIndex, weekday);
    const closureMap = new Map<string, Closure>();

    for (const date of dates) {
      const closure = requiredClosureForDate(date);
      if (closure) closureMap.set(dateId(date), closure);
    }

    const openBeforeOptional = dates.filter((date) => !closureMap.has(dateId(date))).length;

    for (const date of dates) {
      if (closureMap.has(dateId(date))) continue;
      const closure = optionalLongWeekendClosureForDate(date, openBeforeOptional);
      if (closure) closureMap.set(dateId(date), closure);
    }

    const notes: string[] = [];
    const statuses: Record<string, BillingCalendarDateStatus> = {};
    let noMakeupClosures = 0;
    let needsMakeupClosures = 0;

    for (const date of dates) {
      const closure = closureMap.get(dateId(date));
      if (!closure) continue;

      statuses[dateStatusKey(date)] = 'closed';
      if (closure.policy === 'no-makeup') noMakeupClosures += 1;
      if (closure.policy === 'makeup-if-needed') needsMakeupClosures += 1;

      const reviewSuffix = closure.source === 'estimated' ? '; review when TDSB confirms' : '';
      notes.push(`${formatBillingDate(date)}: ${closure.reason}; ${closure.policy === 'no-makeup' ? 'no makeup planned' : 'makeup only if we cannot balance with an extra date'}${reviewSuffix}.`);
    }

    plans[monthIndex] = {
      dates,
      notes,
      statuses,
      openDates: dates.filter((date) => !closureMap.has(dateId(date))),
      noMakeupClosures,
      needsMakeupClosures,
    };
  }

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const plan = plans[monthIndex];
    const billableCount = () =>
      plan.openDates.filter((date) => plan.statuses[dateStatusKey(date)] !== 'moved-out' && plan.statuses[dateStatusKey(date)] !== 'extra').length +
      Object.entries(plan.statuses).filter(([, status]) => status === 'moved-in').length;

    while (billableCount() < 4) {
      const previousPlan = plans[monthIndex - 1];
      const nextPlan = plans[monthIndex + 1];
      const previousExtra = previousPlan?.openDates
        .filter((date) => !previousPlan.statuses[dateStatusKey(date)])
        .filter(() => previousPlan.openDates.filter((openDate) => previousPlan.statuses[dateStatusKey(openDate)] !== 'moved-out' && previousPlan.statuses[dateStatusKey(openDate)] !== 'extra').length > 4)
        .at(-1);
      const nextExtra = nextPlan?.openDates
        .filter((date) => !nextPlan.statuses[dateStatusKey(date)])
        .filter(() => nextPlan.openDates.filter((openDate) => nextPlan.statuses[dateStatusKey(openDate)] !== 'moved-out' && nextPlan.statuses[dateStatusKey(openDate)] !== 'extra').length > 4)
        [0];

      if (previousPlan && previousExtra) {
        annotateMove(previousPlan, plan, previousExtra, monthNames[monthIndex]);
        continue;
      }

      if (nextPlan && nextExtra) {
        annotateMove(nextPlan, plan, nextExtra, monthNames[monthIndex]);
        continue;
      }

      if (plan.noMakeupClosures > 0 && plan.needsMakeupClosures === 0) {
        plan.notes.push(`${monthNames[monthIndex]} ${weekday}: Generated draft leaves ${billableCount()} billed classes because the closure is treated as a no-makeup summer/seasonal billing adjustment.`);
        break;
      }

      plan.notes.push(`${monthNames[monthIndex]} ${weekday}: Generated draft needs ${4 - billableCount()} makeup class${4 - billableCount() === 1 ? '' : 'es'} or a manual billing adjustment.`);
      break;
    }
  }

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const plan = plans[monthIndex];
    const billableOpenDates = plan.openDates.filter((date) => !plan.statuses[dateStatusKey(date)]);
    const extras = billableOpenDates.slice(4);

    for (const date of extras) {
      const key = dateStatusKey(date);
      if (plan.statuses[key]) continue;
      plan.statuses[key] = 'extra';
      plan.notes.push(`${formatBillingDate(date)}: Extra fifth ${weekday}; no extra billing unless leadership chooses to move it.`);
    }
  }

  return plans;
}

function generateBillingCalendarMonths(startYear: number, endYear: number): BillingCalendarMonth[] {
  const months: BillingCalendarMonth[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const weekdayPlans: Record<BillingCalendarWeekday, Record<number, GeneratedCellPlan>> = {
      Mon: buildWeekdayPlans(year, 'Mon'),
      Tue: buildWeekdayPlans(year, 'Tue'),
      Wed: buildWeekdayPlans(year, 'Wed'),
      Thu: buildWeekdayPlans(year, 'Thu'),
      Fri: buildWeekdayPlans(year, 'Fri'),
      Sat: buildWeekdayPlans(year, 'Sat'),
      Sun: buildWeekdayPlans(year, 'Sun'),
    };

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      months.push({
        id: `${year}-${monthNames[monthIndex].toLowerCase()}`,
        year,
        month: monthNames[monthIndex],
        source: 'generated',
        summaryNotes: [
          'Generated from the 2024-2026 billing-calendar pattern: target four billed classes, show closures, pull adjacent extras when that avoids makeup, otherwise mark makeup or billing adjustment.',
          'PA days are not closed here because the copied billing calendars do not close them; review manually if that operating rule changes.',
          'TDSB-specific dates after the published calendars are estimated and should be confirmed before parent-facing use.',
        ],
        days: {
          Mon: createGeneratedCell(weekdayPlans.Mon[monthIndex]),
          Tue: createGeneratedCell(weekdayPlans.Tue[monthIndex]),
          Wed: createGeneratedCell(weekdayPlans.Wed[monthIndex]),
          Thu: createGeneratedCell(weekdayPlans.Thu[monthIndex]),
          Fri: createGeneratedCell(weekdayPlans.Fri[monthIndex]),
          Sat: createGeneratedCell(weekdayPlans.Sat[monthIndex]),
          Sun: createGeneratedCell(weekdayPlans.Sun[monthIndex]),
        },
      });
    }
  }

  return months;
}

const copiedBillingCalendarMonths: BillingCalendarMonth[] = [
  month(2024, 'Jan', {
    Mon: `Jan 8, 15, 22, 29

Jan 1: New Year Day holiday`,
    Tue: `Jan 9, 16, 23, 30

Jan 2: winter break`,
    Wed: `Jan 10, 17, 24, 31

Jan 2: winter break`,
    Thu: `Jan 11, 18, 25, Feb 1

Jan 2: winter break`,
    Fri: `Jan 12, 19, 26, Feb 2

Jan 3: winter break`,
    Sat: 'Jan 6, 13, 20, 27',
    Sun: 'Jan 7, 14, 21, 28',
  }),
  month(2024, 'Feb', {
    Mon: `Feb 5, 12, 19, 26

Feb 19: Closed on Family Day; DO MAKEUP CLASS!`,
    Tue: 'Feb 6, 13, 20, 27',
    Wed: 'Feb 7, 14, 21, 28',
    Thu: 'Feb 8, 15, 22, 29',
    Fri: 'Feb 9, 16, 23, Mar 1',
    Sat: 'Feb 3, 10, 17, 24',
    Sun: 'Feb 4, 11, 18, 25',
  }),
  month(2024, 'Mar', {
    Mon: `Mar 4, 18, 25, Apr 1

Mar 11: March Break; no class, no makeup

Apr 1: Closed on Easter Monday. DO MAKEUP CLASS!`,
    Tue: `Mar 5, 19, 26, Apr 2

Mar 12: March Break; no class, no makeup`,
    Wed: `Mar 6, 20, 27, Apr 3

Mar 13: March Break; no class, no makeup`,
    Thu: `Mar 7, 21, 28, Apr 4

Mar 14: March Break; no class, no makeup`,
    Fri: `Mar 8, 15, 22, Apr 5

Mar 15: March Break; no class, DO MAKEUP CLASS!

Mar 29: Good Friday statutory holiday; no class, no makeup`,
    Sat: `Mar 2, 9, 16, 23

Mar 30: Closed Easter Long Weekend; no makeup`,
    Sun: `Mar 3, 10, 17, 24

Mar 31: Easter Sunday; closed; no makeup`,
  }),
  month(2024, 'Apr', {
    Mon: 'Apr 8, 15, 22, 29',
    Tue: 'Apr 9, 16, 23, 30',
    Wed: 'Apr 10, 17, 24, May 1',
    Thu: 'Apr 11, 18, 25, May 2',
    Fri: 'Apr 12, 19, 26, May 3',
    Sat: 'Apr 6, 13, 20 27',
    Sun: 'Apr 7, 14, 21, 28',
  }),
  month(2024, 'May', {
    Mon: `May 6, 13, 20, 27

May 20: Closed on Victoria Day; DO MAKEUP CLASS!`,
    Tue: 'May 7, 14, 21, 28',
    Wed: 'May 8, 15, 22, 29',
    Thu: 'May 9, 16, 23, 30',
    Fri: 'May 10, 17, 24, 31',
    Sat: 'May 4, 11, 18, 25',
    Sun: 'May 5, 12, 19, 26',
  }),
  month(2024, 'Jun', {
    Mon: 'Jun 3, 10, 17, 24',
    Tue: 'Jun 4, 11, 18, 25',
    Wed: 'Jun 5, 12, 19, 26',
    Thu: 'Jun 6, 13, 20, 27',
    Fri: 'Jun 7, 14, 21, 28',
    Sat: `Jun 1, 8, 15, 22

Jun 29: Closed for Canada Day long weekend; no makeup`,
    Sun: `Jun 2, 9, 16, 23

Jun 30: Closed for Canada Day long weekend; no makeup`,
  }),
  month(2024, 'Jul', {
    Mon: `Jul 8, 15, 22, 29

Jul 1: Closed for Canada Day; no makeup`,
    Tue: 'Jul 2, 9, 16, 23',
    Wed: 'Jul 3, 10, 17, 24',
    Thu: 'Jul 4, 11, 18, 25',
    Fri: 'Jul 5, 12, 19, 26',
    Sat: 'Jul 6, 13, 20, 27',
    Sun: 'Jul 7, 14, 21, 28',
  }),
  month(2024, 'Aug', {
    Mon: `Aug 5, 12, 19, 26

Aug 5: Closed for Civic Day; DO MAKEUP CLASS!`,
    Tue: 'Aug 6, 13, 20, 27',
    Wed: 'Aug 7, 14, 21, 28',
    Thu: 'Aug 1, 8, 15, 22',
    Fri: 'Aug 2, 9, 16, 23',
    Sat: `Aug 3, 10, 17, 24

Aug 3: Closed for Civic Day; ADJUST BILL NO MAKEUP UNLESS PARENTS OKAY WITH IT
Aug 31: Closed for Labour Day long weekend; no makeup`,
    Sun: `Aug 4, 11, 18, 25

Aug 4: Closed for Civic Day; ADJUST BILL NO MAKEUP UNLESS PARENTS OKAY WITH IT`,
  }),
  month(2024, 'Sep', {
    Mon: `Sep 9, 16, 23, 30

Sep 2: Closed on Labour Day; no makeup`,
    Tue: 'Sep 3, 10, 17, 24',
    Wed: 'Sep 4, 11, 18, 25',
    Thu: 'Sep 5, 12, 19, 26',
    Fri: 'Sep 6, 13, 20, 27',
    Sat: 'Sep 7, 14, 21, 28',
    Sun: `Sep 8, 15, 22, 29

Sep 1: Closed for Labour Day long weekend; no makeup`,
  }),
  month(2024, 'Oct', {
    Mon: `Oct 7, 14, 21, 28

Oct 14: Closed on Thanksgiving Monday; DO MAKEUP CLASS!`,
    Tue: 'Oct 1, 8, 15, 22',
    Wed: 'Oct 2, 9, 16, 23',
    Thu: `Oct 3, 10, 17, 24

Oct 31: Closed on Halloween for 5pm and 6pm classes only; no makeup. Open for afterschool pickup and 4pm classes as bonus lesson. Same schedule as Oct 2023.`,
    Fri: 'Oct 4, 11, 18, 25',
    Sat: 'Oct 5, 12, 19, 26',
    Sun: 'Oct 6, 13, 20, 27',
  }),
  month(2024, 'Nov', {
    Mon: 'Nov 4, 11, 18, 25',
    Tue: 'Oct 29, Nov 5, 12, 19',
    Wed: 'Oct 30, Nov 6, 13, 20',
    Thu: 'Nov 7, 14, 21, 28',
    Fri: 'Nov 1, 8, 15, 22',
    Sat: 'Nov 2, 9, 16, 23',
    Sun: 'Nov 3, 10, 17, 24',
  }),
  month(2024, 'Dec', {
    Mon: `Dec 2, 9, 16

Dec 23 & 30: closed - adjust fee apply 1 class credit`,
    Tue: `Nov 26, Dec 3, 10, 17

Dec 24 & 31: closed; do not adjust fee, except for new students joining in Nov and Dec.`,
    Wed: `Nov 27, Dec 4, 11, 18

Dec 25: closed; do not adjust fee; this is extra lesson unless new student starting in Dec`,
    Thu: `Dec 5, 12, 19

Dec 26: closed - adjust fee apply 1 class credit`,
    Fri: `Nov 29, Dec 6, 13, 20

Dec 27: closed; do not adjust fee; this is extra lesson unless new student starting in Dec`,
    Sat: `Nov 30, Dec 7, 14, 21

Dec 28: closed; do not adjust fee; this is extra lesson unless new student starting in Dec`,
    Sun: `Dec 1, 8, 15, 22

Dec 29: closed; do not adjust fee; this is extra lesson unless new student starting in mid Dec`,
  }),
  month(2025, 'Jan', {
    Mon: 'Jan 6, 13, 20, 27',
    Tue: 'Jan 7, 14, 21, 28',
    Wed: `Jan 8, 15, 22, 29

Jan 1: closed; do not adjust fee; this is extra lesson`,
    Thu: `Jan 9, 16, 23, 30

Jan 2: closed; do not adjust fee; this is extra lesson`,
    Fri: `Jan 10, 17, 24, 31

Jan 3: closed; do not adjust fee; this is extra lesson`,
    Sat: `Jan 11, 18, 25

Jan 4: closed winter break; schedule makeup`,
    Sun: `Jan 12, 19, 26

Jan 5: closed winter break; schedule makeup`,
  }, 'Monthly tuition'),
  month(2025, 'Feb', {
    Mon: `Feb 3, 10, 17, 24

Feb 17: closed Family Day; do makeup`,
    Tue: 'Feb 4, 11, 18, 25',
    Wed: 'Feb 5, 12, 19, 26',
    Thu: 'Feb 6, 13, 20, 27',
    Fri: 'Feb 7, 14, 21, 28',
    Sat: 'Feb 1, 8, 15, 22',
    Sun: 'Feb 2, 9, 16, 23',
  }),
  month(2025, 'Mar', {
    Mon: `Mar 3, 10, 17, 24, 31

Mar 10: Closed for March break; no makeup - 5x Mon in March`,
    Tue: `Mar 4, 11, 18, 25, Apr 1

Mar 11: Closed for March break; no makeup - pull up Apr 1 to Mar fee (5x Tue in Apr)`,
    Wed: `Mar 5, 12, 19, 26, Apr 2

Mar 12: Closed for March break; no makeup - pull up Apr 2 to Mar fee (5x Wed in Apr)`,
    Thu: `Mar 6, 13, 20, 27, Apr 3

Mar 13: Closed for March break; no makeup; see below

Apr 3: Pull up from Apr (x4 Thu) but May has 5x Thu`,
    Fri: `Mar 7, 14, 21, 28

Mar 14: Closed for March break; do makeup`,
    Sat: `Mar 1, 8, 15, 22

Mar 29: apply to Apr fee (5x Sat in Mar)`,
    Sun: `Mar 2, 9, 16, 23

Mar 30: apply to Apr fee (5x Sun in Mar)`,
  }),
  month(2025, 'Apr', {
    Mon: `Apr 7, 14, 21, 28

Apr 21: Closed for Easter Monday holiday; do makeup`,
    Tue: `Apr 8, 15, 22, 29

Apr 1: pulled up to include in Mar fee`,
    Wed: `Apr 9, 16, 23, 30

Apr 2: pulled up to include in Mar fee`,
    Thu: `Apr 10, 17, 24, May 1

May 1: Pull up from May to include in Apr fee

Apr 3: Pull up to include in Mar fee`,
    Fri: `Apr 4, 11, 18, 25, May 2

Apr 18: Closed Good Friday holiday; no makeup - pull up May 2 to Apr fee`,
    Sat: `Mar 29, Apr 5, 12, 19, 26

Apr 19: Closed for Easter long wkd; no makeup; has 4 classes in Apr with Mar 29 included in Apr fee`,
    Sun: `Mar 30, Apr 6, 13, 20, 27

Apr 20: Closed for Easter long wkd; no makeup; has 4 classes in Apr with Mar 30 included in Apr fee`,
  }),
  month(2025, 'May', {
    Mon: `May 5, 12, 19, 26, Jun 2

May 19: Closed for Victoria Day holiday; no makeup - pull up Jun 2 to May fee (5x Tue in May)`,
    Tue: 'May 6, 13, 20, 27',
    Wed: 'May 7, 14, 21, 28',
    Thu: `May 8, 15, 22, 29

May 1: Pull up to include in Apr fee`,
    Fri: `May 9, 16, 23, 30

May 2: pull up to include in Apr fee`,
    Sat: `May 3, 10, 17, 24, 31

May 17: Closed for Victoria Day long wkd; no makeup; has 5 Sat in May`,
    Sun: `May 4, 11, 18, 25, Jun 1

May 18: Closed for Victoria Day long wkd; no makeup - pull up Jun 1 to May fee`,
  }),
  month(2025, 'Jun', {
    Mon: `Jun 9, 16, 23, 30

Jun 2: Pulled up to include in May fee`,
    Tue: 'Jun 3, 10, 17, 24',
    Wed: 'Jun 4, 11, 18, 25',
    Thu: 'Jun 5, 12, 19, 26',
    Fri: 'Jun 6, 13, 20, 27',
    Sat: `Jun 7, 14, 21, 28

Jun 28: Closed for Cda Day wkd; do makeup`,
    Sun: `Jun 8, 15, 22, 29

Jun 1: pull up to include in May fee
Jun 29: Closed for Cda Day wkd; do makeup`,
  }),
  month(2025, 'Jul', {
    Mon: 'Jul 7, 14, 21, 28',
    Tue: `Jul 1, 8, 15, 22, 29

Cancel class on Jul 1 Cda Day, no makeup`,
    Wed: 'Jul 2, 9, 16, 23',
    Thu: 'Jul 3, 10, 17, 24',
    Fri: 'Jul 4, 11, 18, 25',
    Sat: 'Jul 5, 12, 19, 26',
    Sun: 'Jul 6, 13, 20, 27',
  }),
  month(2025, 'Aug', {
    Mon: `Aug 4, 11, 18, 25 (ONLY BILL FOR 3 CLASSES)

Aug 4: Closed for Civic Day; No makeup, just don't bill bc it's summer`,
    Tue: 'Aug 5, 12, 19, 26',
    Wed: 'July 30, Aug 6, 13, 20, 27 (extra class)',
    Thu: 'Jul 31, Aug 7, 14, 21, 28 (extra class)',
    Fri: `Aug 1, 8, 15, 22, 29

Aug 29: Closed for Labour Day long wkd, no makeup`,
    Sat: `Aug 2, 9, 16, 23, 30 (ONLY BILL FOR 3 CLASSES)

Aug 2 & 30: Closed for long wkds, no makeup because it's summer`,
    Sun: `Aug 3, 10, 17, 24, 31 (ONLY BILL FOR 3 CLASSES)

Aug 3 & 31: Closed for long wkds; no makeup because it's summer`,
  }),
  month(2025, 'Sep', {
    Mon: `Sep 1, 8, 15, 22, 29

Sep 1: Closed for Labour Day holiday; no makeup`,
    Tue: `Sep 2, 9, 16, 23, 30

Sep 2: Do not suggest that classes start on Sep 2 bc it's the first day of school; suggest to all Tue students that first class is on Sep 9.`,
    Wed: 'Sep 3, 10, 17, 24',
    Thu: 'Sep 4, 11, 18, 25',
    Fri: 'Sep 5, 12, 19, 26',
    Sat: 'Sep 6, 13, 20, 27',
    Sun: 'Sep 7, 14, 21, 28',
  }),
  month(2025, 'Oct', {
    Mon: `Oct 6, 13, 20, 27

Oct 13: Thanksgiving closure; do makeup`,
    Tue: 'Oct 7, 14, 21, 28',
    Wed: `Oct 1, 8, 15, 22, 29

Oct 29: Apply to Nov fee`,
    Thu: `Oct 2, 9, 16, 23, 30

Oct 30: Apply to Nov fee`,
    Fri: `Oct 3, 10, 17, 24, 31

Oct 31: Closed for Halloween; no makeup`,
    Sat: `Oct 4, 11, 18, 25

Oct 11: Open on Thanksgiving wkd; only closed on Mon`,
    Sun: `Oct 5, 12, 19, 26

Oct 12: Open on Thanksgiving wkd; only closed on Mon`,
  }),
  month(2025, 'Nov', {
    Mon: 'Nov 3, 10, 17, 24',
    Tue: 'Nov 4, 11, 18, 25',
    Wed: `Oct 29, Nov 5, 12, 19, 26

Nov 26: Apply to Dec fee`,
    Thu: `Oct 30, Nov 6, 13, 20, 27

Nov 27: Apply to Dec fee`,
    Fri: 'Nov 7, 14, 21, 28',
    Sat: `Nov 1, 8, 15, 22, 29

Nov 29: Apply to Dec fee`,
    Sun: `Nov 2, 9, 16, 23, 30

Nov 30: Apply to Dec fee`,
  }),
  month(2025, 'Dec', {
    Mon: `Dec 1, 8, 15, 22, 29

Dec 22: Open for classes
Dec 29: Winter break closure; no makeup`,
    Tue: `Dec 2, 9, 16, 23, 30

Dec 23: Open for classes
Dec 30: Winter break closure; no makeup`,
    Wed: `Nov 26, Dec 3, 10, 17, 24, 31

Dec 24 & 31: Winter break closure; no makeup`,
    Thu: `Nov 27, Dec 4, 11, 18, 25

Dec 25: Winter break closure; no makeup`,
    Fri: `Dec 5, 12, 19, 26

Dec 26: Winter break closure; do makeup`,
    Sat: `Nov 29, Dec 6, 13, 20, 27

Dec 27: Winter break closure; no makeup`,
    Sun: `Nov 30, Dec 7, 14, 21, 28

Dec 28: Winter break closure; no makeup`,
  }),
  month(2026, 'Jan', {
    Mon: 'Jan 5, 12, 19, 26',
    Tue: 'Jan 6, 13, 20, 27',
    Wed: 'Jan 7, 14, 21, 28',
    Thu: `Jan 1, 8, 15, 22, 29

Jan 1: Winter break closure; no makeup`,
    Fri: `Jan 2, 9, 16, 23, 30

Jan 2: Winter break closure; no makeup`,
    Sat: `Jan 3, 10, 17, 24, 31

Jan 3: Winter break closure; no makeup`,
    Sun: `Jan 4, 11, 18, 25

Jan 4: Winter break closure; do makeup`,
  }),
  month(2026, 'Feb', {
    Mon: `Feb 2, 9, 16, 23

Feb 16: Family Day closure; do makeup`,
    Tue: 'Feb 3, 10, 17, 24',
    Wed: 'Feb 4, 11, 18, 25',
    Thu: 'Feb 5, 12, 19, 26',
    Fri: 'Feb 6, 13, 20, 27',
    Sat: 'Feb 7, 14, 21, 28',
    Sun: 'Feb 1, 8, 15, 22',
  }),
  month(2026, 'Mar', {
    Mon: `Mar 2, 9, 16, 23, 30

Mar 16: March break no classes; no makeup`,
    Tue: `Mar 3, 10, 17, 24, 31

Mar 17: March break no classes; no makeup`,
    Wed: `Mar 4, 11, 18, 25, Apr 1

Mar 18: March break no classes; no makeup`,
    Thu: `Mar 5, 12, 19, 26, Apr 2

Mar 19: March break no classes; no makeup`,
    Fri: `Mar 6, 13, 20 (OPEN DURING MARCH BREAK), 27

Mar 20: March break - OPEN ONLY ON FRI (CLOSED MON-THU) BC ONLY 2 CLASSES AND WOULD NEED TO DO MAKEUP IF WE CLOSE`,
    Sat: 'Mar 7, 14, 21, 28',
    Sun: `Mar 1, 8, 15, 22, 29

Mar 29: Apply to Apr fee`,
  }),
  month(2026, 'Apr', {
    Mon: `Apr 6, 13, 20, 27

Apr 6: Easter Monday closure; do makeup`,
    Tue: 'Apr 7, 14, 21, 28',
    Wed: `Apr 1, 8, 15, 22, 29

Apr 1: Move up to Mar fee`,
    Thu: `Apr 2, 9, 16, 23, 30

Apr 2: Move up to Mar fee`,
    Fri: `Apr 3, 10, 17, 24, May 1

Apr 3: Closed Good Friday; no makeup`,
    Sat: `Apr 4, 11, 18, 25

Open on Sat Apr 4 over Easter wkd; closed on Sun Apr 5`,
    Sun: `Mar 29, Apr 5, 12, 19, 26

Apr 5: Easter Sunday closure; no makeup`,
  }),
  month(2026, 'May', {
    Mon: `May 4, 11, 18, 25

May 18: Victoria Day closure; DO makeup`,
    Tue: 'May 5, 12, 19, 26',
    Wed: 'May 6, 13, 20, 27',
    Thu: 'May 7, 14, 21, 28',
    Fri: `May 1, 8, 15, 22, 29

May 1: Move up to Apr fee`,
    Sat: `May 2, 9, 16, 23, 30

May 16: Victoria Day closure; no makeup`,
    Sun: `May 3, 10, 17, 24, 31

May 17: Victoria Day closure; no makeup`,
  }),
  month(2026, 'June', {
    Mon: `Jun 1, 8, 15, 22, 29

Jun 29: No class; summer camp starts Jun 29; no makeup`,
    Tue: `Jun 2, 9, 16, 23, 30

Jun 30: No class; summer camp starts Jun 29; no makeup`,
    Wed: 'Jun 3, 10, 17, 24',
    Thu: 'Jun 4, 11, 18, 25',
    Fri: '',
    Sat: `Jun 6, 13, 20, 27

Jun 27: Open, Canada Day is on Wed`,
    Sun: `Jun 7, 14, 21, 28

Jun 28: Open, Canada Day is on a Wed`,
  }),
  month(2026, 'Jul', {
    Mon: 'Jul 6, 13, 20, 27',
    Tue: 'Jul 7, 14, 21, 28',
    Wed: `Jul 1, 8, 15, 22, 29

Jul 1: Canada Day closure; no makeup`,
    Thu: `Jul 2, 9, 16, 23, 30

Jul 30: Extra class; open`,
    Fri: `Jul 3, 10, 17, 24, 31

Jul 31: Apply to Aug fee`,
    Sat: 'Jul 4, 11, 18, 25',
    Sun: 'Jul 5, 12, 19, 26',
  }),
  month(2026, 'Aug', {
    Mon: `Aug 3, 10, 17, 24, 31

Aug 3: Closed for Civic Day long wkds; no makeup`,
    Tue: 'Aug 4, 11, 18, 25',
    Wed: 'Aug 5, 12, 19, 26',
    Thu: 'Aug 6, 13, 20, 27',
    Fri: `Jul 31, Aug 7, 14, 21, 28

Aug 28: No classes - extra Fri; no makeup

Just no classes; summer camp will be running on Fri Aug 28`,
    Sat: `Aug 1, 8, 15, 22, 29

Aug 1: Closed for Civic Day long wkd; no makeup`,
    Sun: `Aug 2, 9, 16, 23, 30

Aug 2: Closed for Civic Day long wkd; no makeup`,
  }),
  month(2026, 'Sep', {
    Mon: `Sep 7, 14, 21, 28

Sep 7: Labour Day closure, no class. Do makeup`,
    Tue: `Sep 1, 8, 15, 22, 29

Sep 1: No class. Extra 5th Tue. Still part of summer break; no makeup`,
    Wed: `Sep 2, 9, 16, 23, 30

Sep 2: No class. Extra 5th Wed. Still part of summer break; no makeup`,
    Thu: `Sep 3, 10, 17, 24, Oct 1

Sep 3: No class. Pull up Oct 1 to Sep billing. Still part of summer break; no makeup`,
    Fri: `Sep 4, 11, 18, 25, Oct 2

Sep 4: No class. Pull up Oct 2 to Sep billing. Still part of summer break; no makeup`,
    Sat: `Sep 5, 12, 19, 26, Oct 3

Sep 5: No class. Labour Day long weekend. Pull up Oct 3 to Sep billing; no makeup`,
    Sun: `Sep 6, 13, 20, 27

Sep 6: No class. Labour Day long weekend. Do makeup`,
  }),
  month(2026, 'Oct', {
    Mon: `Oct 5, 12, 19, 26

Oct 12: Closed for Thanksgiving holiday. Do makeup`,
    Tue: 'Oct 6, 13, 20, 27',
    Wed: 'Oct 7, 14, 21, 28',
    Thu: `Oct 1, 8, 15, 22, 29

Oct 1: Pull up to Sep billing bc 5x Thu`,
    Fri: `Oct 2, 9, 16, 23, 30

Oct 2: Pull up to Sep billing bc 5x Fri`,
    Sat: `Oct 3, 10, 17, 24, 31

Oct 3: Pull up to Sep billing bc 5x Sat

Oct 10: Open over Thanksgiving weekend; only close on Mon Oct 12

Oct 31: Open on Halloween bc it's a Sat; no conflict with trick or treating this year`,
    Sun: `Oct 4, 11, 18, 25

Oct 11: Open over Thanksgiving weekend; only close on Mon Oct 12`,
  }),
  month(2026, 'Nov', {
    Mon: `Nov 2, 9, 16, 23, 30

Nov 30: Move to Dec billing; 5th Mon in Nov`,
    Tue: 'Nov 3, 10, 17, 24',
    Wed: 'Nov 4, 11, 18, 25',
    Thu: 'Nov 5, 12, 19, 26',
    Fri: 'Nov 6, 13, 20, 27',
    Sat: 'Nov 7, 14, 21, 28',
    Sun: `Nov 1, 8, 15, 22, 29

Nov 29: Move to Dec billing bc 5x Sun`,
  }),
  month(2026, 'Dec', {
    Mon: `Nov 30, Dec 7, 14, 21, 28

Dec 21: Open for classes (no pickup) even though it's during school winter break

Dec 28: Closed for winter break. No class; no makeup.`,
    Tue: `Dec 1, 8, 15, 22, 29

Dec 22: Open for classes (no pickup) even though it's during school winter break

Dec 29: Closed for winter break. No class; no makeup.`,
    Wed: `Dec 2, 9, 16, 23, 30

Dec 23 & 30: Closed for winter break. Do only 1 makeup bc Dec 30 is extra lesson.`,
    Thu: `Dec 3, 10, 17, 24, 31

Dec 24 & 31: No class. Closed for winter break. Do only 1 makeup bc Dec 31 is extra lesson.`,
    Fri: `Dec 4, 11, 18, 25

Dec 25: No class. Closed for Christmas Day and winter break; do makeup`,
    Sat: `Dec 5, 12, 19, 26

Dec 26: No class. Closed for Boxing Day and winter break; do makeup`,
    Sun: `Nov 29, Dec 6, 13, 20, 27

Dec 27: Closed for winter break. No class; no makeup bc extra lesson.`,
  }),
];

const generatedBillingCalendarMonths = generateBillingCalendarMonths(2027, 2031);

export const billingCalendarMonths: BillingCalendarMonth[] = [
  ...copiedBillingCalendarMonths,
  ...generatedBillingCalendarMonths,
];

export const billingCalendarYears = Array.from(
  new Set(billingCalendarMonths.map((entry) => entry.year)),
).sort((a, b) => b - a);

export function getBillingCalendarMonths(year: number): BillingCalendarMonth[] {
  return billingCalendarMonths.filter((entry) => entry.year === year);
}

export function getDefaultBillingCalendarYear(referenceDate = new Date()): number {
  const currentYear = referenceDate.getFullYear();
  const currentOrPastYear = billingCalendarYears.find((year) => year <= currentYear);
  if (currentOrPastYear) return currentOrPastYear;

  return Math.min(...billingCalendarYears);
}

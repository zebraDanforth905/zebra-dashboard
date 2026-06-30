function parseLocalISODate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDate(value: Date | string) {
  if (typeof value === 'string') {
    const parsed = parseLocalISODate(value);
    if (parsed) return parsed;

    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) return null;
    return new Date(
      fallback.getUTCFullYear(),
      fallback.getUTCMonth(),
      fallback.getUTCDate()
    );
  }

  return new Date(value);
}

function isWeekday(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function displayDatesForCampRange(start: Date, end: Date) {
  const weekdays: Date[] = [];

  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    if (isWeekday(day)) weekdays.push(new Date(day));
  }

  if (weekdays.length === 0) {
    return { start, end };
  }

  return {
    start: weekdays[0],
    end: weekdays[weekdays.length - 1],
  };
}

export function formatCampWeekRange(startValue: Date | string, endValue: Date | string) {
  const start = normalizeDate(startValue);
  const end = normalizeDate(endValue);
  if (!start || !end) return `${startValue} to ${endValue}`;

  const orderedStart = start <= end ? start : end;
  const orderedEnd = start <= end ? end : start;
  const display = displayDatesForCampRange(orderedStart, orderedEnd);

  const startText = display.start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endText = display.end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${startText} - ${endText}`;
}

export function formatCampWeekLabel(startValue: Date | string, endValue: Date | string) {
  return `Week of ${formatCampWeekRange(startValue, endValue)}`;
}

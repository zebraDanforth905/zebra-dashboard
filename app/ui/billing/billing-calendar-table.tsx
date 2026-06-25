import clsx from 'clsx';
import {
  BillingCalendarCell,
  BillingCalendarDateStatus,
  BillingCalendarMonth,
  BillingCalendarWeekday,
} from '@/app/lib/definitions';
import { billingCalendarWeekdays } from '@/app/lib/billing-calendar';

type NoteKind = 'makeup' | 'no-makeup' | 'billing' | 'closed' | 'open' | 'note';

type ClassDateItem = {
  label: string;
  key: string | null;
};

const monthAliases: Record<string, string> = {
  jan: 'jan',
  january: 'jan',
  feb: 'feb',
  february: 'feb',
  mar: 'mar',
  march: 'mar',
  apr: 'apr',
  april: 'apr',
  may: 'may',
  jun: 'jun',
  june: 'jun',
  jul: 'jul',
  july: 'jul',
  aug: 'aug',
  august: 'aug',
  sep: 'sep',
  sept: 'sep',
  september: 'sep',
  oct: 'oct',
  october: 'oct',
  nov: 'nov',
  november: 'nov',
  dec: 'dec',
  december: 'dec',
};

const noteStyles: Record<NoteKind, string> = {
  makeup: 'border-amber-200 bg-amber-50 text-amber-900',
  'no-makeup': 'border-slate-200 bg-slate-50 text-slate-700',
  billing: 'border-sky-200 bg-sky-50 text-sky-800',
  closed: 'border-rose-200 bg-rose-50 text-rose-800',
  open: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  note: 'border-violet-200 bg-violet-50 text-violet-800',
};

const cellTone: Record<NoteKind, string> = {
  makeup: 'bg-amber-50/45',
  'no-makeup': 'bg-slate-50',
  billing: 'bg-sky-50/55',
  closed: 'bg-rose-50/45',
  open: 'bg-emerald-50/45',
  note: 'bg-white',
};

const dateStatusStyles: Record<BillingCalendarDateStatus, string> = {
  closed: 'border-rose-300 bg-rose-100 text-rose-800 line-through decoration-2',
  'moved-in': 'border-emerald-300 bg-emerald-50 text-emerald-800',
  'moved-out': 'border-sky-300 bg-sky-50 text-sky-800',
  extra: 'border-violet-300 bg-violet-50 text-violet-800',
};

const dateStatusTitles: Record<BillingCalendarDateStatus, string> = {
  closed: 'Closed date',
  'moved-in': 'Moved into this billing month',
  'moved-out': 'Moved to another billing month',
  extra: 'Extra fifth date, not counted in monthly billing',
};

function noteKind(note: string): NoteKind {
  const lower = note.toLowerCase();
  const lines = note.split('\n').map((line) => line.trim()).filter(Boolean);
  const hasOpenLine = lines.some(isOpenClassLine);
  const hasClosedLine = lines.some(isClosedDateLine);
  const wantsMakeup =
    /(do|schedule).*makeup/.test(lower) ||
    /makeup class/.test(lower) ||
    /do only \d+ makeup/.test(lower);

  if (hasOpenLine && !hasClosedLine) return 'open';
  if (wantsMakeup && !lower.includes('no makeup')) return 'makeup';
  if (lower.includes('no makeup')) return 'no-makeup';
  if (/(pull|move|apply|adjust|bill|billing|fee|credit|extra)/.test(lower)) return 'billing';
  if (hasClosedLine) return 'closed';
  if (hasOpenLine) return 'open';
  return 'note';
}

function normalizeMonth(month: string): string | null {
  return monthAliases[month.toLowerCase()] ?? null;
}

function makeDateKey(month: string, day: string): string | null {
  const normalizedMonth = normalizeMonth(month);
  if (!normalizedMonth) return null;
  return `${normalizedMonth}-${Number(day)}`;
}

function parseClassDates(classes: string): ClassDateItem[] {
  let currentMonth: string | null = null;
  const datesOnly = classes.replace(/\([^)]*\)/g, ' ');
  const datePattern = /\b(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(\d{1,2})\b/gi;
  const items: ClassDateItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = datePattern.exec(datesOnly)) !== null) {
    const explicitMonth = match[1];
    const day = match[2];

    if (explicitMonth) {
      currentMonth = explicitMonth;
    }

    if (!currentMonth) continue;

    items.push({
      label: `${currentMonth.slice(0, 3)} ${Number(day)}`,
      key: makeDateKey(currentMonth, day),
    });
  }

  return items;
}

function isOpenClassLine(line: string): boolean {
  const lower = line.toLowerCase();
  return /\bopen\b/.test(lower) && !/(no class|cancel)/.test(lower);
}

function isClosedDateLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (isOpenClassLine(line)) return false;
  return /(closed|closure|no class|cancel|winter break|holiday|summer break|march break no classes)/.test(lower);
}

function closedDateKeys(notes: string[]): Set<string> {
  const keys = new Set<string>();

  for (const note of notes) {
    for (const line of note.split('\n')) {
      if (!isClosedDateLine(line)) continue;

      const prefix = line.split(':')[0] ?? '';
      const monthMatch = prefix.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
      if (!monthMatch) continue;

      const month = monthMatch[1];
      const numbers = prefix.slice(monthMatch.index).match(/\b\d{1,2}\b/g) ?? [];
      for (const day of numbers) {
        const key = makeDateKey(month, day);
        if (key) keys.add(key);
      }
    }
  }

  return keys;
}

function cellDateStatuses(cell: BillingCalendarCell): Map<string, BillingCalendarDateStatus> {
  const statuses = new Map<string, BillingCalendarDateStatus>(
    Object.entries(cell.dateStatuses ?? {}),
  );

  for (const key of closedDateKeys(cell.notes)) {
    if (!statuses.has(key)) statuses.set(key, 'closed');
  }

  return statuses;
}

function cellKind(cell: BillingCalendarCell): NoteKind {
  const kinds = cell.notes.map(noteKind);
  if (kinds.includes('makeup')) return 'makeup';
  if (kinds.includes('billing')) return 'billing';
  if (kinds.includes('no-makeup')) return 'no-makeup';
  if (kinds.includes('closed')) return 'closed';
  if (kinds.includes('open')) return 'open';
  return 'note';
}

function noteLabel(kind: NoteKind): string {
  switch (kind) {
    case 'makeup':
      return 'Makeup needed';
    case 'no-makeup':
      return 'No makeup needed';
    case 'billing':
      return 'Billing move';
    case 'closed':
      return 'Closed';
    case 'open':
      return 'Open';
    default:
      return 'Note';
  }
}

function countCells(
  months: BillingCalendarMonth[],
  predicate: (cell: BillingCalendarCell) => boolean,
): number {
  return months.reduce((sum, month) => {
    return sum + billingCalendarWeekdays.filter((day) => predicate(month.days[day])).length;
  }, 0);
}

function CountBadge({
  listedCount,
  closedCount,
  movedOutCount,
  extraCount,
  billedCount,
}: {
  listedCount: number;
  closedCount: number;
  movedOutCount: number;
  extraCount: number;
  billedCount: number;
}) {
  if (listedCount === 0) {
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
        No dates listed
      </span>
    );
  }

  const isFourClassPlan = billedCount === 4;
  const adjustments: string[] = [];

  if (closedCount > 0) adjustments.push(`${closedCount} closed`);
  if (movedOutCount > 0) adjustments.push(`${movedOutCount} moved`);
  if (extraCount > 0) adjustments.push(`${extraCount} extra`);

  return (
    <span
      className={clsx(
        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
        isFourClassPlan
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      {adjustments.length > 0
        ? `${billedCount} billed + ${adjustments.join(' + ')}`
        : `${billedCount} billed date${billedCount === 1 ? '' : 's'}`}
    </span>
  );
}

function CalendarCell({ cell }: { cell: BillingCalendarCell }) {
  const classDates = parseClassDates(cell.classes);
  const dateStatuses = cellDateStatuses(cell);
  const statusCounts = classDates.reduce(
    (counts, item) => {
      const status = item.key ? dateStatuses.get(item.key) : undefined;

      if (status === 'closed') counts.closed += 1;
      if (status === 'moved-out') counts.movedOut += 1;
      if (status === 'extra') counts.extra += 1;

      return counts;
    },
    { closed: 0, movedOut: 0, extra: 0 },
  );
  const billedCount =
    classDates.length - statusCounts.closed - statusCounts.movedOut - statusCounts.extra;

  if (!cell.classes && cell.notes.length === 0) {
    return <span className="text-xs text-slate-300">No classes listed</span>;
  }

  return (
    <div className="space-y-2">
      {cell.classes && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {classDates.map((item, index) => {
              const status = item.key ? dateStatuses.get(item.key) : undefined;
              return (
                <span
                  key={`${item.label}-${index}`}
                  className={clsx(
                    'inline-flex rounded-md border px-1.5 py-0.5 text-[12px] font-semibold leading-tight',
                    status ? dateStatusStyles[status] : 'border-slate-200 bg-white text-slate-900',
                  )}
                  title={status ? dateStatusTitles[status] : 'Listed class date'}
                >
                  {item.label}
                </span>
              );
            })}
          </div>
          {classDates.length === 0 && (
            <div className="text-[13px] font-semibold leading-snug text-slate-900">
              {cell.classes}
            </div>
          )}
          <CountBadge
            listedCount={classDates.length}
            closedCount={statusCounts.closed}
            movedOutCount={statusCounts.movedOut}
            extraCount={statusCounts.extra}
            billedCount={billedCount}
          />
        </div>
      )}
      {cell.notes.length > 0 && (
        <div className="space-y-1.5">
          {cell.notes.map((note) => {
            const currentKind = noteKind(note);
            return (
              <div
                key={note}
                className={clsx(
                  'rounded-md border px-2 py-1 text-[11px] leading-snug',
                  noteStyles[currentKind],
                )}
              >
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide">
                  {noteLabel(currentKind)}
                </span>
                <span>{note}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BillingCalendarTable({
  months,
}: {
  months: BillingCalendarMonth[];
}) {
  const makeupCells = countCells(months, (cell) =>
    cell.notes.some((note) => noteKind(note) === 'makeup'),
  );
  const noMakeupCells = countCells(months, (cell) =>
    cell.notes.some((note) => noteKind(note) === 'no-makeup'),
  );
  const billingMoveCells = countCells(months, (cell) =>
    cell.notes.some((note) => noteKind(note) === 'billing'),
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Months</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">{months.length}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-amber-800">Makeup calls</div>
          <div className="mt-1 text-2xl font-semibold text-amber-950">{makeupCells}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600">No makeup</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">{noMakeupCells}</div>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-sky-700">Billing moves</div>
          <div className="mt-1 text-2xl font-semibold text-sky-950">{billingMoveCells}</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-20 w-28 bg-slate-50 px-3 py-3 font-semibold">
                  Month
                </th>
                {billingCalendarWeekdays.map((weekday) => (
                  <th key={weekday} className="min-w-40 px-3 py-3 font-semibold">
                    {weekday}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {months.map((month) => (
                <tr key={month.id} className="align-top">
                  <th className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-950">
                    <div>{month.month}</div>
                    {month.source === 'generated' && (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium leading-snug text-amber-900">
                        Generated draft
                      </div>
                    )}
                    {month.convergeMessage && (
                      <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium leading-snug text-emerald-800">
                        {month.convergeMessage}
                      </div>
                    )}
                  </th>
                  {billingCalendarWeekdays.map((weekday: BillingCalendarWeekday) => {
                    const currentCell = month.days[weekday];
                    return (
                      <td
                        key={`${month.id}-${weekday}`}
                        className={clsx(
                          'min-w-40 border-r border-slate-100 px-3 py-3 last:border-r-0',
                          cellTone[cellKind(currentCell)],
                        )}
                      >
                        <CalendarCell cell={currentCell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

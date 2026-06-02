import clsx from 'clsx';
import {
  BillingCalendarCell,
  BillingCalendarMonth,
  BillingCalendarWeekday,
} from '@/app/lib/definitions';
import { billingCalendarWeekdays } from '@/app/lib/billing-calendar';

type NoteKind = 'makeup' | 'no-makeup' | 'billing' | 'closed' | 'open' | 'note';

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

function noteKind(note: string): NoteKind {
  const lower = note.toLowerCase();
  const wantsMakeup =
    /(do|schedule).*makeup/.test(lower) ||
    /makeup class/.test(lower) ||
    /do only \d+ makeup/.test(lower);

  if (wantsMakeup && !lower.includes('no makeup')) return 'makeup';
  if (lower.includes('no makeup')) return 'no-makeup';
  if (/(pull|move|apply|adjust|bill|billing|fee|credit|extra)/.test(lower)) return 'billing';
  if (/(closed|closure|no class|cancel)/.test(lower)) return 'closed';
  if (lower.includes('open')) return 'open';
  return 'note';
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
      return 'Makeup';
    case 'no-makeup':
      return 'No makeup';
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

function CalendarCell({ cell }: { cell: BillingCalendarCell }) {
  const kind = cellKind(cell);

  if (!cell.classes && cell.notes.length === 0) {
    return <span className="text-xs text-slate-300">No classes listed</span>;
  }

  return (
    <div className="space-y-2">
      {cell.classes && (
        <div className="text-[13px] font-semibold leading-snug text-slate-900">
          {cell.classes}
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
      {cell.notes.length === 0 && (
        <div
          className={clsx(
            'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
            noteStyles[kind],
          )}
        >
          4-class month
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

import Link from 'next/link';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import {
  billingCalendarSource,
  billingCalendarYears,
  getBillingCalendarMonths,
  getDefaultBillingCalendarYear,
} from '@/app/lib/billing-calendar';
import BillingCalendarTable from '@/app/ui/billing/billing-calendar-table';

type SearchParams = Promise<{
  year?: string;
}>;

export default async function BillingCalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedYear = Number(params.year);
  const activeYear = billingCalendarYears.includes(requestedYear)
    ? requestedYear
    : getDefaultBillingCalendarYear();
  const months = getBillingCalendarMonths(activeYear);

  return (
    <div className="m-2 space-y-4 md:m-4">
      <div>
        <Link
          href="/dashboard/billing"
          className="mb-2 inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Billing
        </Link>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Billing Calendar</h1>
            <p className="mt-1 text-sm text-slate-600">
              Four-class billing plan copied from {billingCalendarSource.spreadsheetTitle} / {billingCalendarSource.sheetName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              {billingCalendarYears.map((year) => (
                <Link
                  key={year}
                  href={`/dashboard/billing/calendar?year=${year}`}
                  className={
                    year === activeYear
                      ? 'rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm'
                      : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }
                >
                  {year}
                </Link>
              ))}
            </div>

            <Link
              href={billingCalendarSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Source Sheet
            </Link>
          </div>
        </div>
      </div>

      <BillingCalendarTable months={months} />
    </div>
  );
}

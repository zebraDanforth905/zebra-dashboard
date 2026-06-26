import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { connection } from 'next/server';
import { fetchCampActivitySchedule, fetchCampStaffSchedule, fetchCampPrintableSchedule } from '@/app/lib/data';
import CampPrintableSchedule from '@/app/ui/camp/camp-printable-schedule';

const parseLocalISODate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default async function PrintableCampSchedulePage({
  params,
}: {
  params: Promise<{ startDate: string; endDate: string }>;
}) {
  await connection();
  const { startDate, endDate } = await params;

  const parsedStart = parseLocalISODate(startDate);
  const parsedEnd = parseLocalISODate(endDate);

  if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) {
    notFound();
  }

  const [schedule, activityCells, staffCells] = await Promise.all([
    fetchCampPrintableSchedule(startDate, endDate),
    fetchCampActivitySchedule(startDate),
    fetchCampStaffSchedule(startDate),
  ]);

  return (
    <div className="print:block">
      <div className="bg-slate-700 px-3 pt-4 print:hidden">
        <div className="mx-auto max-w-[11in]">
          <Link
            href={`/dashboard/camp/${startDate}/${endDate}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-sky-100"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Week
          </Link>
        </div>
      </div>
      <CampPrintableSchedule schedule={schedule} activityCells={activityCells} staffCells={staffCells} />
    </div>
  );
}

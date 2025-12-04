import { fetchEnrollmentReport } from '@/app/lib/enrollment-report';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import EnrollmentReportTable from '@/app/ui/billing/enrollment-report-table';
import { auth } from '@/auth';

type SearchParams = Promise<{
  startDate?: string;
  endDate?: string;
}>;

export default async function EnrollmentReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown';
  
  // Default to current month if no dates provided
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  const startDate = params.startDate || defaultStartDate;
  const endDate = params.endDate || defaultEndDate;

  const enrollments = await fetchEnrollmentReport(startDate, endDate);

  return (
    <div className="m-2 md:m-4">
      {/* Header */}
      <div className="mb-4">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-2"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Billing
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          Enrollment Report
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          View all enrollments started within a specified date range
        </p>
      </div>

      <EnrollmentReportTable 
        enrollments={enrollments}
        startDate={startDate}
        endDate={endDate}
        currentUserName={currentUserName}
      />
    </div>
  );
}

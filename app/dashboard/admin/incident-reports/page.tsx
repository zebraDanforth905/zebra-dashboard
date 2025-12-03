import { fetchIncidentReports } from '@/app/lib/incident-reports';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import IncidentReportsTable from '@/app/ui/admin/incident-reports-table';

type SearchParams = {
  status?: string;
};

export default async function IncidentReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const userType = (session?.user as any)?.user_type;

  // Only allow admin users
  if (userType !== 'admin') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const statusParam = params?.status || 'new,in progress';
  const statuses = statusParam === 'all' ? undefined : statusParam.split(',');
  const reports = await fetchIncidentReports(statuses);

  return (
    <div className="m-2 md:m-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Incident Reports
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          View and manage incident reports submitted by users
        </p>
      </div>

      <IncidentReportsTable reports={reports} currentStatus={statusParam} />
    </div>
  );
}

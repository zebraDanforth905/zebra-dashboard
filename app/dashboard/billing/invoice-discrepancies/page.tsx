import { fetchInvoiceDiscrepancies } from '@/app/lib/invoice-discrepancies';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import InvoiceDiscrepanciesTable from '@/app/ui/billing/invoice-discrepancies-table';
import RefreshDiscrepanciesButton from '@/app/ui/billing/refresh-discrepancies-button';
import { auth } from '@/auth';
import { connection } from 'next/server';

export default async function InvoiceDiscrepanciesPage() {
  await connection();
  const discrepancies = await fetchInvoiceDiscrepancies();
  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown';

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Invoice Discrepancies Report
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Customers with enrollments/pickups that don't match their scheduled recurring invoices
            </p>
          </div>
          <RefreshDiscrepanciesButton />
        </div>
      </div>

      <InvoiceDiscrepanciesTable 
        discrepancies={discrepancies} 
        currentUserName={currentUserName}
      />
    </div>
  );
}

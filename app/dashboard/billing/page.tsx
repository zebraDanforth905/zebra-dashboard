import CustomerTable from "@/app/ui/billing/customer-table";
import Search from "@/app/ui/search";
import { Suspense } from "react";
import Pagination from "@/app/ui/pagination";
import { fetchCustomerPages, fetchUnassignedStudentsWithEnrolments } from "@/app/lib/data";
import { auth } from "@/auth";
import RecurringCSVUpload from "@/app/ui/billing/recurring-csv-upload";
import UnassignedStudents from "@/app/ui/billing/unassigned-students";
import QBOFilter from "@/app/ui/billing/qbo-filter";
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export default async function Page(props: {
  searchParams?: Promise<{
    query?: string;
    studentQuery?: string;
    page?: string;
    sortBy?: string;
    incDec?: boolean;
    qboFilter?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const currentPage = Number(searchParams?.page) || 1;
  const sortBy = searchParams?.sortBy || 'c.name';
  const incDec = searchParams?.incDec || true;
  const qboFilter = searchParams?.qboFilter;
  const totalPages = await fetchCustomerPages(query, qboFilter);

  // Check if user is admin
  const session = await auth();
  const isAdmin = (session?.user as any)?.user_type === 'admin';

  // Fetch all customers for the CSV upload component and unassigned students
  const customers = isAdmin ? await sql<{ id: string; name: string; email: string }[]>`
    SELECT id, name, email FROM customers ORDER BY name;
  ` : [];

  const unassignedStudents = isAdmin ? await fetchUnassignedStudentsWithEnrolments() : [];

  return (
    <div className="m-3 md:m-6 space-y-6">
      {/* CSV Upload Section - Admin Only */}
      {isAdmin && (
        <RecurringCSVUpload customers={customers} />
      )}

      {/* Unassigned Students Section - Admin Only */}
      {isAdmin && unassignedStudents.length > 0 && (
        <UnassignedStudents students={unassignedStudents} customers={customers} />
      )}

      {/* Customers Section */}
      <div>
        <div className="flex w-full items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold">Customers</h1>
        </div>

        <div className="my-4 flex items-center justify-between gap-2 md:mt-8">
          <Search placeholder="Search customers..." />
          <QBOFilter />
        </div>
        <Suspense key={query + currentPage + qboFilter}>
          <CustomerTable query={query} currentPage={currentPage} sortBy={sortBy} incDec={incDec} qboFilter={qboFilter} />
        </Suspense>
        <div className="mt-5 flex w-full justify-center">
          <Pagination totalPages={totalPages} />
        </div>
      </div>
    </div>
  );
}
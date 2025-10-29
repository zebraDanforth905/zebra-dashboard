import CustomerTable from "@/app/ui/billing/customer-table";
import Search from "@/app/ui/search";
import { Suspense } from "react";
import Pagination from "@/app/ui/pagination";
import { fetchCustomerPages } from "@/app/lib/data";


export default async function Page(props: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    sortBy?: string;
    incDec?: boolean;
  }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const currentPage = Number(searchParams?.page) || 1;
  const sortBy = searchParams?.sortBy || 'c.name';
  const incDec = searchParams?.incDec || true;
  const totalPages = await fetchCustomerPages(query);

  return (
    <div className="w-full">
      <div className="flex w-full items-center justify-between">
        <h1 className={`text-2xl`}>Customers</h1>
      </div>

      <div className="my-4 flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="Search invoices..." />
        {/* <CreateInvoice /> */}
      </div>
       <Suspense key={query + currentPage}>
        <CustomerTable query={query} currentPage={currentPage} sortBy={sortBy} incDec={incDec} />
      </Suspense>
      <div className="mt-5 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
    </div>
  );
}
import AddStudentForm from "@/app/ui/billing/add-student";
import StudentTable from "@/app/ui/students/student-table";
import Search from "@/app/ui/search";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import Pagination from "@/app/ui/pagination";
import { fetchStudentPages } from "@/app/lib/data";
import { Suspense } from "react";

export default async function Page(props: {searchParams?: 
  Promise<{
    query?: string;
    studentQuery?: string;
    page?: string;
    sortBy?: string;}>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const studentQuery = searchParams?.studentQuery || '';
  const page = Number(searchParams?.page) || 1;
  const sortBy = searchParams?.sortBy || 's.name';
  const totalPages = await fetchStudentPages(query);
  
  return <div className="m-6">
      <div className="flex w-full items-center justify-between">
        <h1 className={`text-2xl`}>Students</h1>
      </div>
      <div className="my-4 flex items-center justify-between gap-2 md:mt-8"> 
        <Search placeholder="Search students..." />
      </div>
      <Suspense>
      <StudentTable query={query} currentPage={page} sortBy={sortBy}/>
      </Suspense>
      <div className="mt-5 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
      
    </div>
}
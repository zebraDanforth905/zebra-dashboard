import AddStudentForm from "@/app/ui/billing/add-student";
import StudentTable from "@/app/ui/students/student-table";
import Search from "@/app/ui/search";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import Pagination from "@/app/ui/pagination";
import { fetchStudentPages } from "@/app/lib/data";
import PickupForm from "@/app/ui/schedule/pickup-form";

export default async function Page(props: {searchParams?: 
  Promise<{
    query?: string;
    studentQuery?: string;
    page?: string;
    sortBy?: string;}>;
  params: Promise<{id: string}>;}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const studentQuery = searchParams?.studentQuery || '';
  const page = Number(searchParams?.page) || 1;
  const sortBy = searchParams?.sortBy || 's.name';
  const id = (await props.params)?.id;
  
  const totalPages = await fetchStudentPages(query);
  
  return <div>
      <div className="flex w-full items-center justify-between">
        <h1 className={`text-2xl`}>Students</h1>
      </div>
      <PickupForm studentId={id} returnUrl={`/dashboard/students/${id}/edit`} />
    </div>
}
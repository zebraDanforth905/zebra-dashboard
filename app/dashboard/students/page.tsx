import AddStudentForm from "@/app/ui/billing/add-student";
import StudentTable from "@/app/ui/students/student-table";
import Search from "@/app/ui/search";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

export default async function Page(props: {searchParams?: Promise<{query?: string;}>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  
  return <div>
    
    </div>
}

import React from "react";

import AddStudentForm from "@/app/ui/billing/add-student";  

export default async function Page(props: { params: Promise<{ id: string }>; searchParams?: Promise<{studentQuery?: string;}>; }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const id = params.id;

  const studentQuery = searchParams?.studentQuery || '';
  
  return (
    <main>
      <AddStudentForm query={studentQuery} customer_id={id}/>
    </main>
  );
}

import React from "react";

import AddStudentButton from "@/app/ui/billing/add-student-button";  

// app/dashboard/billing/[id]/edit/page.tsx
import Link from "next/link";
import { fetchCustomerById, fetchRecurringInvoicesByCustomer, fetchUnnassignedStudents, fetchCustomerInvoices } from "@/app/lib/data";
import CustomerSearchList from "@/app/ui/billing/customer-search-list";
import RecurringInvoiceTable from "@/app/ui/billing/recurring_invoice_list";
import EditCustomerName from "@/app/ui/billing/edit-customer-name";
import { UnassignStudentButton } from "@/app/ui/buttons";
import InvoiceTable from "@/app/ui/billing/invoice-table";

export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ query?: string; studentQuery?: string }>;
}) {

  const id = (await props.params)?.id;
  const searchParams = await props.searchParams;
  const studentQuery = searchParams?.studentQuery || '';
  const query = searchParams?.query || '';

  const customer = await fetchCustomerById(id || " ");
  const invoices = await fetchRecurringInvoicesByCustomer(id);
  const unassignedStudents = await fetchUnnassignedStudents(''); // Fetch all unassigned students
  const customerInvoices = await fetchCustomerInvoices(id); // Fetch customer invoices


  return (
    <div className="min-h-[calc(100vh-6rem)] grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4 m-6">
      <CustomerSearchList query={query} id={id} />

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-4">
        {customer ? (
          <EditCustomerName 
            customerId={customer.id}
            initialName={customer.name}
            initialEmail={customer.email}
          />
        ) : (
          <h1 className="text-2xl font-semibold text-slate-800 mb-4">
            Customer Not Found
          </h1>
        )}
        
        <h2 className="text-lg font-medium text-slate-700 mb-2">Students:</h2>

          {customer && customer.students.length > 0 ? (
            customer.students.map((student) => (
              <div key={student.id} className="flex items-center justify-between border-b border-slate-200">
              <Link
                
                href={`/dashboard/students/${student.id}/edit`}
                className="block"
              >

              <div key={student.id} className="py-2 px-4 last:border-0 flex justify-between">
                <div>
                  <div className="font-medium text-slate-800">{student.name}</div>
                </div>
              </div>
              
              </Link>

              <UnassignStudentButton id={student.id} />
               </div>
            ))
          ) : (
            <div className="text-sm text-slate-500 px-2 py-2">No students enrolled.</div>
          )}
        <AddStudentButton customerId={id || ''} allStudents={unassignedStudents} />
        <h2 className="text-lg font-medium text-slate-700 mt-6 mb-2">Recurring Invoices:</h2>
          
        <RecurringInvoiceTable customerId={id} initialInvoices={invoices} />

        <h2 className="text-lg font-medium text-slate-700 mt-6 mb-2">Manual Invoices:</h2>
        <InvoiceTable customerId={id} initialInvoices={customerInvoices} />
        
      </section>
    </div>
  );
}

import React from "react";

import AddStudentButton from "@/app/ui/billing/add-student-button";  

// app/dashboard/billing/[id]/edit/page.tsx
import Link from "next/link";
import { fetchCustomerById, fetchRecurringInvoicesByCustomer, fetchCustomerInvoices, fetchCustomerStudentsEnrolments, fetchCustomerPayments, fetchCustomerConvergePayments, fetchCustomerNotes } from "@/app/lib/data";
import CustomerSearchList from "@/app/ui/billing/customer-search-list";
import RecurringInvoiceTable from "@/app/ui/billing/recurring_invoice_list";
import EditCustomerName from "@/app/ui/billing/edit-customer-name";
import { UnassignStudentButton } from "@/app/ui/buttons";
import InvoiceTable from "@/app/ui/billing/invoice-table";
import CustomerStudentsSummary from "@/app/ui/billing/customer-students-summary";
import CustomerPaymentsTable from "@/app/ui/billing/customer-payments-table";
import CustomerConvergePayments from "@/app/ui/billing/customer-converge-payments";
import CustomerNotesSection from "@/app/ui/billing/customer-notes-section";
import { auth } from "@/auth";

export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ query?: string; studentQuery?: string }>;
}) {

  const id = (await props.params)?.id;
  const searchParams = await props.searchParams;
  const studentQuery = searchParams?.studentQuery || '';
  const query = searchParams?.query || '';

  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const customer = await fetchCustomerById(id || " ");
  const invoices = await fetchRecurringInvoicesByCustomer(id);
  const customerInvoices = await fetchCustomerInvoices(id); // Fetch customer invoices
  const studentsEnrolments = await fetchCustomerStudentsEnrolments(id); // Fetch enrolments and pickups
  const payments = await fetchCustomerPayments(id); // Fetch payments
  const convergePayments = await fetchCustomerConvergePayments(id); // Fetch converge recurring payments
  const customerNotes = await fetchCustomerNotes(id); // Fetch customer notes


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
        
        <CustomerNotesSection 
          customerId={id} 
          customerName={customer?.name || 'Unknown Customer'}
          notes={customerNotes}
          currentUserName={currentUserName}
        />
        
        <h2 className="text-lg font-medium text-slate-700 mb-2">Students:</h2>

        <AddStudentButton customerId={id || ''} />
        
        <h2 className="text-lg font-medium text-slate-700 mt-6 mb-2">Student Activities:</h2>
        <CustomerStudentsSummary students={studentsEnrolments} />
        
        <h2 className="text-lg font-medium text-slate-700 mt-6 mb-2">Recurring Invoices:</h2>
          
        <RecurringInvoiceTable customerId={id} initialInvoices={invoices} />

        <InvoiceTable customerId={id} initialInvoices={customerInvoices} />
        
        <h2 className="text-lg font-medium text-slate-700 mt-6 mb-2">Payments:</h2>
        <CustomerPaymentsTable customerId={id} initialPayments={payments} />
        
        <h2 className="text-lg font-medium text-slate-700 mt-6 mb-2">Converge Recurring Payments:</h2>
        <CustomerConvergePayments payments={convergePayments} />
        
      </section>
    </div>
  );
}
"use client";

import { useState } from "react";
import Link from "next/link";
import RecurringInvoiceTable from "@/app/ui/billing/recurring_invoice_list";
import RecurringInvoiceForm from "@/app/ui/billing/recurring-invoice-form";
import AddStudentPopup from "@/app/ui/billing/add-student";
import type { RecurringInvoiceListData, CustomerTableData, RecurringInvoice} from "@/app/lib/definitions";

export default function EditBillingClient({
  customer,
  invoices,
  id,
  studentQuery,
  action,
}: {
  customer: CustomerTableData;
  invoices: RecurringInvoiceListData[];
  id: string;
  studentQuery: string;
  action: (fd: FormData) => Promise<RecurringInvoice>;
}) {
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);

  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-4">
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">
        {customer ? customer.name : "Customer Not Found"}
      </h1>

      {/* Students */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium text-slate-700">Students</h2>
        <button
          onClick={() => setShowAddStudent(true)}
          className="text-sm rounded-xl bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-700"
        >
          + Add Student
        </button>
      </div>

      {customer.students?.length ? (
        customer.students.map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/students/${s.id}/edit`}
            className="block px-3 py-2 rounded-lg hover:bg-slate-50"
          >
            <div className="font-medium text-slate-800">{s.name}</div>
          </Link>
        ))
      ) : (
        <div className="text-sm text-slate-500">No students enrolled.</div>
      )}

      {/* Recurring invoices */}
      <div className="flex items-center justify-between mt-6 mb-2">
        <h2 className="text-lg font-medium text-slate-700">Recurring Invoices</h2>
        <button
          onClick={() => setShowInvoiceForm(true)}
          className="text-sm rounded-xl bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-700"
        >
          + New Invoice
        </button>
      </div>

      <RecurringInvoiceTable invoices={invoices} />

      {/* Popups */}
      {showAddStudent && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="relative">
            <AddStudentPopup
              query={studentQuery}
              customer_id={id}
              title="Add a student"
            />
            <button
              onClick={() => setShowAddStudent(false)}
              className="absolute top-2 right-3 text-slate-500 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {showInvoiceForm && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="relative w-[28rem]">
            <RecurringInvoiceForm
              customer_id={id}
              action={action}
            />
            <button
              onClick={() => setShowInvoiceForm(false)}
              className="absolute top-2 right-3 text-slate-500 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

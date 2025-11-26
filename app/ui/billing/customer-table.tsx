import React from 'react';
import { CustomerTableData, Student } from '@/app/lib/definitions';
import { fetchFilteredCustomers } from '@/app/lib/data';
import Sorter from '../sorter';
import postgres from 'postgres';
import AddStudentPopup from './add-student';
import { assignStudent } from '@/app/lib/actions';
import Link from 'next/link';
import { ClickableRow } from '../clickable-row';
import { formatDate } from '@/app/lib/utils';
import QBOToggle from './qbo-toggle';
import CustomerNoteCell from './customer-note-cell';
import { auth } from '@/auth';

export default async function CustomerTable({ 
  query, 
  currentPage, 
  sortBy, 
  incDec, 
  qboFilter,
  balanceFilter,
  studentsFilter,
  paymentsFilter,
  recurringPaymentsFilter,
  scheduledInvoicesFilter,
  paymentMatchFilter
}: { 
  query: string; 
  currentPage: number; 
  sortBy: string; 
  incDec: boolean; 
  qboFilter?: string;
  balanceFilter?: string;
  studentsFilter?: string;
  paymentsFilter?: string;
  recurringPaymentsFilter?: string;
  scheduledInvoicesFilter?: string;
  paymentMatchFilter?: string;
}) { 
    
    
    const session = await auth();
    const currentUserName = session?.user?.name || 'Unknown User';
    
    const customers = await fetchFilteredCustomers(
      query, 
      currentPage, 
      sortBy, 
      incDec, 
      qboFilter,
      balanceFilter,
      studentsFilter,
      paymentsFilter,
      recurringPaymentsFilter,
      scheduledInvoicesFilter,
      paymentMatchFilter
    );
    
  
    return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm w-full">
      <div className="max-h-[calc(100vh-240px)] overflow-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500 z-10">
            <tr>
              <th className="w-3"></th>
              <th className="px-1.5 py-1.5 font-medium"><Sorter sortString='c.name'>Name</Sorter></th>
              <th className="px-1.5 py-1.5 font-medium"><Sorter sortString='c.email'>Email</Sorter></th>
              <th className="px-1.5 py-1.5 font-medium text-center"><Sorter sortString='c.set_up_qbo'>QBO</Sorter></th>
              <th className="px-1.5 py-1.5 font-medium text-right"><Sorter sortString='total_due'>Balance</Sorter></th>
              <th className="px-1.5 py-1.5 font-medium text-right"><Sorter sortString='rec.next_invoice_date'>Next Invoice</Sorter></th>
              <th className="px-1.5 py-1.5 font-medium text-right"><Sorter sortString='pay.next_payment_date'>Next Payment</Sorter></th>
              <th className="px-1.5 py-1.5 font-medium">Student(s)</th>
              <th className="px-1.5 py-1.5 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-xs text-slate-500">
                  No customers found.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <ClickableRow key={c.id} href={`/dashboard/billing/${c.id}/edit`}>
                  
                  <td className="relative px-1.5 py-1.5 font-medium text-slate-900">{c.name}</td>
                  <td className="relative px-1.5 py-1.5 text-slate-700 max-w-xs truncate">{c.email}</td>
                  <td className="relative px-1.5 py-1.5 text-center z-10">
                    <div className="flex justify-center">
                      <QBOToggle customerId={c.id} isSetUp={c.set_up_qbo || false} />
                    </div>
                  </td>
                  <td className="relative px-1.5 py-1.5 text-right">
                    <span className={c.total_due > 0 ? "text-red-600 font-medium" : "text-slate-700"}>
                      ${(c.total_due/100).toFixed(2)}
                    </span>
                  </td>
                  <td className="relative px-1.5 py-1.5 text-right text-slate-700">
                    {c.next_invoice_date ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-medium">${(c.next_invoice_amount/100).toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500">{formatDate(c.next_invoice_date)}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">—</span>
                    )}
                  </td>
                  <td className="relative px-1.5 py-1.5 text-right text-slate-700">
                    {c.next_recurring_payment_date ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-medium">${Number(c.next_recurring_payment_amount).toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500">{formatDate(c.next_recurring_payment_date)}</span>
                        {c.next_recurring_payment_description && (
                          <span className="text-[10px] text-slate-400 italic max-w-[120px] truncate">{c.next_recurring_payment_description}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">—</span>
                    )}
                  </td>
                  <td className="relative px-1.5 py-1.5">
                  
                    {c.students && c.students.length > 0 ? (
                      <div className="flex flex-wrap gap-0.5">
                        {c.students.map((s: Student) => (
                          <span 
                            key={s.id} 
                            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${
                              s.has_activity
                                ? 'bg-blue-50 text-blue-700 border-blue-100'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">No students</span>
                    )}
                    
                  </td>
                  <td className="relative px-1.5 py-1.5 z-10">
                    <CustomerNoteCell customer={c} currentUserName={currentUserName} />
                  </td>
                  
                </ClickableRow>
              
            ))
          )}
          
        </tbody>
      </table>
      </div>
    </div>
  );
}

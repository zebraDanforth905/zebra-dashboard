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

export default async function CustomerTable({ query, currentPage, sortBy, incDec }: { query: string; currentPage: number; sortBy: string; incDec:boolean; }) { 
    
    
    
    const customers = await fetchFilteredCustomers(query, currentPage, sortBy, incDec);
    
  
    return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 w-full">
      <div className="max-h-[calc(100vh-280px)] overflow-auto">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 z-10">
            <tr>
              <th className="w-4"></th>
              <th className="px-2 py-2.5 font-medium"><Sorter sortString='c.name'>Name</Sorter></th>
              <th className="px-2 py-2.5 font-medium"><Sorter sortString='c.email'>Email</Sorter></th>
              <th className="px-2 py-2.5 font-medium text-right"><Sorter sortString='total_due'>Overdue</Sorter></th>
              <th className="px-2 py-2.5 font-medium text-right"><Sorter sortString='rec.next_invoice_date'>Next Invoice</Sorter></th>
              <th className="px-2 py-2.5 font-medium text-right"><Sorter sortString='pay.next_payment_date'>Next Payment</Sorter></th>
              <th className="px-2 py-2.5 font-medium">Student(s)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  No customers found.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <ClickableRow key={c.id} href={`/dashboard/billing/${c.id}/edit`}>
                  
                  <td className="relative px-2 py-2.5 font-medium text-slate-900">{c.name}</td>
                  <td className="relative px-2 py-2.5 text-slate-700 max-w-xs truncate">{c.email}</td>
                  <td className="relative px-2 py-2.5 text-right">
                    <span className={c.total_due > 0 ? "text-red-600 font-medium" : "text-slate-700"}>
                      ${(c.total_due/100).toFixed(2)}
                    </span>
                  </td>
                  <td className="relative px-2 py-2.5 text-right text-slate-700">
                    {c.next_invoice_date ? (
                      <div className="flex flex-col items-end">
                        <span className="font-medium">${(c.next_invoice_amount/100).toFixed(2)}</span>
                        <span className="text-xs text-slate-500">{formatDate(c.next_invoice_date)}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">—</span>
                    )}
                  </td>
                  <td className="relative px-2 py-2.5 text-right text-slate-700">
                    
                  </td>
                  <td className="relative px-2 py-2.5">
                  
                    {c.students && c.students.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.students.map((s: Student) => (
                          <span key={s.id} className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">No students</span>
                    )}
                    
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

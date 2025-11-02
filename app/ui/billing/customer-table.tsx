import React from 'react';
import { CustomerTableData, Student } from '@/app/lib/definitions';
import { fetchFilteredCustomers } from '@/app/lib/data';
import Sorter from '../sorter';
import postgres from 'postgres';
import AddStudentPopup from './add-student';
import { assignStudent } from '@/app/lib/actions';
import Link from 'next/link';
import { ClickableRow } from '../clickable-row';

export default async function CustomerTable({ query, currentPage, sortBy, incDec }: { query: string; currentPage: number; sortBy: string; incDec:boolean; }) { 
    
    
    
    const customers = await fetchFilteredCustomers(query, currentPage, sortBy, incDec);
    
  
    return (
    <div className="overflow-x-auto ring-1 ring-slate-100">
      <table className="min-w-full text-left text-sm text-slate-700">
        <thead className="text-black bg-slate-200">
          <tr>
            <th></th>
            <th className="px-4 py-3 font-medium"><Sorter sortString='c.name'>Name</Sorter></th>
            <th className="px-4 py-3 font-medium"><Sorter sortString='c.email'>Email</Sorter></th>
            <th className="px-4 py-3 font-medium text-right"><Sorter sortString='total_due'>Total Overdue</Sorter></th>
            <th className="px-4 py-3 font-medium text-right"><Sorter sortString='inv.next_invoice_date'>Next Invoice</Sorter></th>
            <th className="px-4 py-3 font-medium text-right"><Sorter sortString='pay.next_payment_date'>Next Setup Payment Date</Sorter></th>
            <th className="px-4 py-3 font-medium text-right"><Sorter sortString='pay.next_payment_amount'>Next Setup Payment Amount</Sorter></th>
            <th className="px-4 py-3 font-medium">Student(s)</th>
          
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-6 text-center text-slate-500">
                No customers found.
              </td>
            </tr>
          ) : (
            customers.map((c) => (
              <ClickableRow key={c.id} href={`/dashboard/billing/${c.id}/edit`}>
                
                <td className="relative px-4 py-3 font-medium text-slate-800">{c.name}</td>
                <td className="relative px-4 py-3">{c.email}</td>
                <td className="relative px-4 py-3 text-right text-slate-700">${c.total_due/100}</td>
                <td className="relative px-4 py-3 text-right text-slate-700">{c.next_invoice_amount} {c.next_invoice_date?.toDateString()}</td>
                <td className="relative px-4 py-3 text-right text-slate-700">{c.next_payment_date?.toDateString()}</td>
                <td className="relative px-4 py-3 text-right text-slate-700">${c.next_payment_amount/100}</td>
                

                <td className="relative px-4 py-3">
                
                  {c.students && c.students.length > 0 ? (
                    <ul className="list-disc list-inside text-slate-700">
                      {c.students.map((s: Student) => (
                        
                        <li key={s.id}>{s.name}</li>
                        
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                  
                </td>
                
              </ClickableRow>
              // <tr
              //   key={c.id}
              //   className="border-t border-slate-100 even:bg-slate-50 hover:bg-sky-50 transition"
              // >

              //   <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
              //   <td className="px-4 py-3">{c.email}</td>
              //   <td className="px-4 py-3 text-right text-slate-700">${c.total_due/100}</td>
              //   <td className="px-4 py-3 text-right text-slate-700">{c.next_invoice_amount} {c.next_invoice_date?.toDateString()}</td>
              //   <td className="px-4 py-3 text-right text-slate-700">{c.next_payment_date?.toDateString()}</td>
              //   <td className="px-4 py-3 text-right text-slate-700">${c.next_payment_amount/100}</td>
                

              //   <td className="px-4 py-3">
                
              //     {c.students && c.students.length > 0 ? (
              //       <ul className="list-disc list-inside text-slate-700">
              //         {c.students.map((s: Student) => (
                        
              //           <li key={s.id}>{s.name}</li>
                        
              //         ))}
              //       </ul>
              //     ) : (
              //       <span className="text-slate-400">—</span>
              //     )}
                  
              //   </td>
              //   <td>
              //       <Link key={c.id} href={`/dashboard/billing/${c.id}/edit`}>edit</Link>
                  
              //   </td>
              // </tr>
          
              
            ))
          )}
          
        </tbody>
      </table>
                  
    </div>
  );
}

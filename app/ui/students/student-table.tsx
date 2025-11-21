import React from "react";

import AddStudentForm from "../billing/add-student";
import Search from "../searchStudent";
import { fetchFilteredStudentsTable } from "@/app/lib/data";
import Sorter from "../sorter";
import StudentNoteCell from "./student-note-cell";
import { auth } from "@/auth";

export default async function StudentTable({query, currentPage, sortBy} : {query: string; currentPage: number; sortBy: string;}) {

  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const students = await fetchFilteredStudentsTable(
    query,
    currentPage,
    sortBy,
  );
    
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 w-full">
      <div className="max-h-[calc(100vh-280px)] overflow-auto">
        {students.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">No students found.</div>
        ) : ( 
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium"><Sorter sortString="s.name">Name</Sorter></th>
                <th className="px-4 py-2.5 font-medium"><Sorter sortString="c.name">Customer</Sorter></th>
                <th className="px-4 py-2.5 font-medium"><Sorter sortString="ec.enrolled_courses">Enrolled Courses</Sorter></th>
                <th className="px-4 py-2.5 font-medium"><Sorter sortString="pd.pickup_days">Pickup Days</Sorter></th>
                <th className="px-4 py-2.5 font-medium">Recent Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
               
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-2.5 text-slate-700">{s.customer_name || <span className="text-slate-400 italic">Unassigned</span>}</td>
                  <td className="px-4 py-2.5">
                    {s.enrolled_courses && s.enrolled_courses.length > 0 ? (
                      <ul className="space-y-1">
                        {s.enrolled_courses.map((ec) => (
                          <li key={ec.id} className="text-slate-700">
                            <span className="font-medium">{ec.course_name}</span>
                            <span className="text-xs text-slate-500 ml-2">{ec.weekday} {ec.start_time} - {ec.end_time}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-400 italic text-xs">No enrollments</span>
                    )}
                  </td> 
                  <td className="px-4 py-2.5">
                    {s.pickup_days && s.pickup_days.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.pickup_days.map((pd) => (
                          <span key={pd.id} className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
                            {pd.weekday}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">No pickup days</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StudentNoteCell student={s} currentUserName={currentUserName} />
                  </td>
                  </tr>
         
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
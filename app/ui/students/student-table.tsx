import React from "react";
import Link from "next/link";

import AddStudentForm from "../billing/add-student";
import Search from "../searchStudent";
import { fetchFilteredStudentsTable } from "@/app/lib/data";
import Sorter from "../sorter";
import StudentNoteCell from "./student-note-cell";
import { auth } from "@/auth";
import { PencilIcon } from "@heroicons/react/24/outline";

export default async function StudentTable({query, currentPage, sortBy} : {query: string; currentPage: number; sortBy: string;}) {

  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const students = await fetchFilteredStudentsTable(
    query,
    currentPage,
    sortBy,
  );
    
  return (
    <div className="overflow-x-auto ring-1 ring-slate-100">
      <div
        className="
          max-h-[600px] overflow-auto border border-slate-200
          bg-white
        "
      >
        {students.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No students found.</div>
        ) : ( 
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="text-black bg-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium"><Sorter sortString="s.name">Name</Sorter></th>
                <th className="px-4 py-3 font-medium"><Sorter sortString="c.name">Customer</Sorter></th>
                <th className="px-4 py-3 font-medium"><Sorter sortString="ec.enrolled_courses">Enrolled Courses</Sorter></th>
                <th className="px-4 py-3 font-medium"><Sorter sortString="pd.pickup_days">Pickup Days</Sorter></th>
                <th className="px-4 py-3 font-medium">Recent Note</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
               
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3">{s.customer_name || 'Unassigned'}</td>
                  <td className="px-4 py-3">
                    {s.enrolled_courses && s.enrolled_courses.length > 0 ? (
                      <ul className="list-disc list-inside text-slate-700">
                        {s.enrolled_courses.map((ec) => (
                          <li key={ec.id}>{ec.course_name} {ec.start_time} : {ec.end_time}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-500">No enrollments</span>
                    )}
                  </td> 
                  <td className="px-4 py-3">
                    {s.pickup_days && s.pickup_days.length > 0 ? (
                      <ul className="list-disc list-inside text-slate-700">
                        {s.pickup_days.map((pd) => (
                          <li key={pd.id}>{pd.weekday}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-500">No pickup days</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StudentNoteCell student={s} currentUserName={currentUserName} />
                  </td>
                  <td className="px-4 py-3">
                    <Link 
                      href={`/dashboard/students/${s.id}/edit`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                      Edit
                    </Link>
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
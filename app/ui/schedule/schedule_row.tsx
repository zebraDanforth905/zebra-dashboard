import React from "react";
import { fetchSessionStudents } from "@/app/lib/data";


export default async function ScheduleTable({sessionId} : {sessionId: string;}) {
  
    const students = await fetchSessionStudents(sessionId);   
    console.log("Fetched students:", students);

    return (    
    <>
      {students.map((student) => (
        <div key={student.enrolment_id} className="py-2 px-4 border-b last:border-0 flex justify-between">
            <div>
                <div className="font-medium text-slate-800">{student.name}</div>
                <div className="text-sm text-slate-600">{student.course_name}</div>
            </div>
        </div>
        ))} 
    </>
  );
}
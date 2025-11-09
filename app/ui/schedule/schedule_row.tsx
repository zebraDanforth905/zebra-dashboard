import React from "react";
import { fetchSessionStudents, fetchUpcomingSessionMakeups, fetchUpcomingSessionTrials } from "@/app/lib/data";



export default async function ScheduleTable({sessionId} : {sessionId: string;}) {
  
    const students = await fetchSessionStudents(sessionId);   
    const makeups = await fetchUpcomingSessionMakeups(sessionId);
    const trials = await fetchUpcomingSessionTrials(sessionId);
    console.log("Fetched students:", students);

    return (    
    <>
       {trials.map((student) => (
        <div key={student.trial_id + student.name} className="py-2 px-4 border-b last:border-0 flex justify-between bg-yellow-200">
            <div>
                <div className="font-medium text-slate-800">{student.name}</div>
                <div className="text-sm text-slate-600">{student.course_name}</div>
                <div className="text-sm text-slate-600">{student.date.toDateString()}</div>
            </div>
        </div>
        ))} 
       
       {makeups.map((student) => (
        <div key={student.makeup_id + student.name} className="py-2 px-4 border-b last:border-0 flex justify-between bg-sky-200">
            <div>
                <div className="font-medium text-slate-800">{student.name}</div>
                <div className="text-sm text-slate-600">{student.course_name}</div>
                <div className="text-sm text-slate-600">{student.date.toDateString()}</div>
            </div>
        </div>
        ))} 

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
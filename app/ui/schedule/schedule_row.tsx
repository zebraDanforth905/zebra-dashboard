import React from "react";
import {
  fetchSessionStudents,
  fetchSessionAttendanceMap,
  fetchUpcomingSessionMakeups,
  fetchUpcomingSessionTrials,
} from "@/app/lib/data";
import { auth } from "@/auth";
import { ymdLocal } from "@/app/lib/schedule-week";
import type { PortalAttendanceValue } from "@/app/lib/actions";
import ScheduleRowClient from "./schedule-row-client";

export default async function ScheduleTable({ sessionId, date }: { sessionId: string; date?: Date }) {

  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const students = await fetchSessionStudents(sessionId, date);
  const makeups = await fetchUpcomingSessionMakeups(sessionId, date);
  const trials = await fetchUpcomingSessionTrials(sessionId, date);

  // The date these rows apply to, as 'YYYY-MM-DD' for the attendance buttons.
  const sessionDate = date ? ymdLocal(date) : undefined;

  // Seed each enrolment's button with the real portal status. The local DB only
  // knows absences, so without this present students would show as "unmarked".
  // Falls back to the local absent flag for students the portal has no mark for.
  const attendanceMap = await fetchSessionAttendanceMap(sessionId, date);
  const initialAttendance: Record<string, PortalAttendanceValue> = {};
  for (const s of students || []) {
    // students.id is numeric in the DB ("15876.00"); normalize to the integer
    // key the portal map uses.
    const fromPortal = attendanceMap[String(Number(s.student_id))];
    initialAttendance[s.enrolment_id] = fromPortal ?? (s.absent ? "absent" : "unmarked");
  }

  return (
    <ScheduleRowClient
      students={students || []}
      trials={trials || []}
      makeups={makeups || []}
      currentUserName={currentUserName}
      sessionDate={sessionDate}
      initialAttendance={initialAttendance}
    />
  );
}

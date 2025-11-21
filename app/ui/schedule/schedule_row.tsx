import React from "react";
import {
  fetchSessionStudents,
  fetchUpcomingSessionMakeups,
  fetchUpcomingSessionTrials,
} from "@/app/lib/data";
import { auth } from "@/auth";
import ScheduleRowClient from "./schedule-row-client";

export default async function ScheduleTable({ sessionId }: { sessionId: string }) {
  
  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const students = await fetchSessionStudents(sessionId);
  const makeups = await fetchUpcomingSessionMakeups(sessionId);
  const trials = await fetchUpcomingSessionTrials(sessionId);

  return (
    <ScheduleRowClient 
      students={students || []}
      trials={trials || []}
      makeups={makeups || []}
      currentUserName={currentUserName}
    />
  );
}

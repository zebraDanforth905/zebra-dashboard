import React from "react";
import {
  fetchSessionStudents,
  fetchUpcomingSessionMakeups,
  fetchUpcomingSessionTrials,
} from "@/app/lib/data";
import { auth } from "@/auth";
import ScheduleRowClient from "./schedule-row-client";

export default async function ScheduleTable({ sessionId, date }: { sessionId: string; date?: Date }) {
  
  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const students = await fetchSessionStudents(sessionId, date);
  const makeups = await fetchUpcomingSessionMakeups(sessionId, date);
  const trials = await fetchUpcomingSessionTrials(sessionId, date);

  return (
    <ScheduleRowClient 
      students={students || []}
      trials={trials || []}
      makeups={makeups || []}
      currentUserName={currentUserName}
    />
  );
}

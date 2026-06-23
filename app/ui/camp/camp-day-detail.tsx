'use client';

import CampSessionDetail from './camp-session-detail';
import { CampEnrolmentWithStudent } from '@/app/lib/definitions';

export default function CampDayDetail({
  dayDate,
  dayEnrolments,
  seatAssignments,
}: {
  dayDate: Date;
  dayEnrolments: Map<string, CampEnrolmentWithStudent[]>;
  seatAssignments?: Map<number, string[]>;
}) {
  // flatten enrolments from all groups
  const allEnrolments = Array.from(dayEnrolments.values()).flat();

  const session = {
    start_date: dayDate,
    end_date: dayDate,
    enrolment_count: allEnrolments.length,
    enrolments: allEnrolments,
  };

  return (
    <div>
      {/* seating chart identical to session detail */}
      <CampSessionDetail
        session={session}
        seatAssignments={seatAssignments}
        seatAssignmentsDate={dayDate}
      />
    </div>
  );
}

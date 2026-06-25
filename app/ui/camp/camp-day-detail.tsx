'use client';

import CampSessionDetail from './camp-session-detail';
import { CampEnrolmentWithStudent, CampSeatAssignmentGroup } from '@/app/lib/definitions';

const parseLocalISODate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export default function CampDayDetail({
  dayDate,
  enrolments,
  seatAssignments,
}: {
  dayDate: string;
  enrolments: CampEnrolmentWithStudent[];
  seatAssignments?: CampSeatAssignmentGroup[];
}) {
  const parsedDayDate = parseLocalISODate(dayDate);

  const session = {
    start_date: parsedDayDate,
    end_date: parsedDayDate,
    enrolment_count: enrolments.length,
    enrolments,
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

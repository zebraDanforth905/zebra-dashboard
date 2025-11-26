
import { UnassignStudentButton } from "../buttons";
interface Enrolment {
  course_name: string;
  weekday: string;
  start_time: string;
  end_time: string;
}

interface Pickup {
  weekday: string;
  school_name: string;
}

interface StudentSummary {
  student_id: string;
  student_name: string;
  enrolments: Enrolment[];
  pickups: Pickup[];
}

interface CustomerStudentsSummaryProps {
  students: StudentSummary[];
}


const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function CustomerStudentsSummary({ students }: CustomerStudentsSummaryProps) {
  if (students.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No students assigned to this customer
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {students.map((student) => (
        <div key={student.student_id} className="border border-gray-200 rounded-lg p-3">
          <h4 className="font-semibold text-sm mb-2 flex flex-row justify-between">{student.student_name} <UnassignStudentButton id={student.student_id} /></h4>
          
          <div className="grid gap-3 md:grid-cols-2">
            {/* Enrolments */}
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Enrolments</div>
              {student.enrolments.length > 0 ? (
                <div className="space-y-1">
                  {student.enrolments
                    .sort((a, b) => weekdayOrder.indexOf(a.weekday) - weekdayOrder.indexOf(b.weekday))
                    .map((enrolment, idx) => (
                      <div key={idx} className="text-xs bg-blue-50 rounded px-2 py-1.5">
                        <div className="font-medium">{enrolment.course_name}</div>
                        <div className="text-gray-600">
                          {enrolment.weekday} • {enrolment.start_time} - {enrolment.end_time}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic">No enrolments</div>
              )}
            </div>

            {/* Pickups */}
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Pickups</div>
              {student.pickups.length > 0 ? (
                <div className="space-y-1">
                  {student.pickups
                    .sort((a, b) => weekdayOrder.indexOf(a.weekday) - weekdayOrder.indexOf(b.weekday))
                    .map((pickup, idx) => (
                      <div key={idx} className="text-xs bg-green-50 rounded px-2 py-1.5">
                        <div className="font-medium">{pickup.weekday}</div>
                        <div className="text-gray-600">{pickup.school_name}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic">No pickups</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

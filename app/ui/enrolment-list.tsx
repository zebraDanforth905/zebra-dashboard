'use server';

import { fetchFilteredEnrolments } from "../lib/data";
import { createSlipInfo } from "../lib/actions";
import { PlusCircleIcon } from "@heroicons/react/24/outline";

function makePassword(fullName: string): string {
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  let pwd = first.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (pwd.length >= 8) return pwd;

  pwd = pwd + "123";
  const seq = "4567890";
  let i = 0;
  while (pwd.length < 8) {
    pwd += seq[i % seq.length];
    i += 1;
  }
  return pwd;
}

export default async function EnrolmentList(props: { query: string; userId: string }) {
  const { query, userId } = props;
  
  if (!query || query.length < 2) {
    return (
      <div className="text-sm text-gray-500 p-4">
        Type at least 2 characters to search for students...
      </div>
    );
  }

  const enrolments = await fetchFilteredEnrolments(query);

  if (enrolments.length === 0) {
    return (
      <div className="text-sm text-gray-500 p-4">
        No students found matching "{query}"
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-h-96 overflow-y-auto">
      <div className="divide-y divide-gray-200">
        {enrolments.map((enrolment) => {
          // Format other_fields with proper ordering and labels
          const fields: string[] = [];
          const processedKeys = new Set<string>();
          
          if (enrolment.other_fields) {
            // Add Scratch fields in order (Login then Password)
            if (enrolment.other_fields['Scratch Login']) {
              fields.push(`Scratch Login: ${enrolment.other_fields['Scratch Login']}`);
              processedKeys.add('Scratch Login');
              if (enrolment.other_fields['Scratch Password']) {
                fields.push(`Password: ${enrolment.other_fields['Scratch Password']}`);
                processedKeys.add('Scratch Password');
              }
            }
            
            // Add Roblox fields in order (Username then Password)
            if (enrolment.other_fields['Roblox Login']) {
              fields.push(`Roblox Login: ${enrolment.other_fields['Roblox Login']}`);
              processedKeys.add('Roblox Login');
              if (enrolment.other_fields['Roblox Password']) {
                fields.push(`Password: ${enrolment.other_fields['Roblox Password']}`);
                processedKeys.add('Roblox Password');
              }
            }
            
            // Add any other fields (like Laptop # or custom fields)
            Object.entries(enrolment.other_fields).forEach(([key, value]) => {
              if (!processedKeys.has(key) && value) {
                fields.push(`${key}: ${value}`);
              }
            });
          }
          
          const otherFieldsString = fields.join('\n');
          
          return (
            <form key={enrolment.enrolment_id} action={createSlipInfo} className="p-4 hover:bg-gray-50 transition-colors">
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="student_name" value={enrolment.student_name} />
              <input type="hidden" name="lms_username" value={Number(enrolment.student_id) + "@zebrarobotics.com"} />
              <input type="hidden" name="lms_password" value={makePassword(enrolment.student_name)} />
              <input type="hidden" name="course_name" value={enrolment.course_name} />
              <input type="hidden" name="other_fields" value={otherFieldsString} />
              
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{enrolment.student_name}</div>
                  <div className="text-sm text-gray-600">{Number(enrolment.student_id) + "@zebrarobotics.com" || ""}</div>
                  <div className="text-sm text-gray-500">{enrolment.course_name}</div>
                  
                  {enrolment.other_fields && Object.keys(enrolment.other_fields).length > 0 && (
                    <div className="text-xs text-gray-400 mt-1">
                      + {Object.keys(enrolment.other_fields).length} additional field(s)
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-full transition-colors"
                  title="Add slip for this student"
                >
                  <PlusCircleIcon className="w-6 h-6" />
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

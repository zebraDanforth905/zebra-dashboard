import { updateCoachCapacity, updateCoachQualifications } from '@/app/lib/actions';
import {
  StaffScheduleCourseOption,
  StaffScheduleQualification,
  StaffScheduleUser,
} from '@/app/lib/staff-schedule-types';
import CreateUserForm from '@/app/ui/admin/create-user-form';
import UsersList from '@/app/ui/admin/users-list';

type SettingsViewProps = {
  users: StaffScheduleUser[];
  courseOptions: StaffScheduleCourseOption[];
  qualifications: StaffScheduleQualification[];
  adminUsers: Array<{
    id: string;
    name: string;
    email: string;
    user_type: string;
  }>;
  isAdmin: boolean;
};

export function SettingsView({
  users,
  courseOptions,
  qualifications,
  adminUsers,
  isAdmin,
}: SettingsViewProps) {
  return (
    <div className="space-y-4">

      {/* User management — collapsed by default */}
      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-gray-900 hover:bg-gray-50">
          User Management {!isAdmin && <span className="ml-2 text-xs font-normal text-amber-700">(admin only)</span>}
        </summary>
        <div className="border-t border-gray-200 p-4">
          {isAdmin ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-1">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Create User</h3>
                <CreateUserForm />
              </div>
              <div className="xl:col-span-2">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Manage Users</h3>
                <UsersList users={adminUsers} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-800">User creation and deletion are admin-only.</p>
          )}
        </div>
      </details>

      {/* Capacities + Qualifications side by side */}
      <div className="grid gap-4 xl:grid-cols-2">

        {/* Coach Capacities — compact table */}
        <details className="rounded-lg border border-gray-200 bg-white" open>
          <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-gray-900 hover:bg-gray-50">
            Coach Capacities
          </summary>
          <div className="border-t border-gray-200 p-4">
            <p className="mb-3 text-xs text-gray-500">Coaching capacity used in coverage calculations.</p>
            <table className="w-full text-sm">
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-gray-900">{u.name}</td>
                    <td className="py-1.5">
                      <form action={updateCoachCapacity} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="number"
                          name="coachCapacity"
                          min={0}
                          max={50}
                          defaultValue={u.coach_capacity}
                          className="w-16 rounded border border-gray-300 px-2 py-0.5 text-sm"
                        />
                        <button className="rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">Save</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* Coach Qualifications — one collapsible row per coach */}
        <details className="rounded-lg border border-gray-200 bg-white" open>
          <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-gray-900 hover:bg-gray-50">
            Coach Qualifications
          </summary>
          <div className="border-t border-gray-200 p-4">
            <p className="mb-3 text-xs text-gray-500">Expand a coach to edit their qualified courses, then save.</p>
            <div className="space-y-1">
              {users.map((u) => {
                const selected = new Set(
                  qualifications.filter((q) => q.user_id === u.id).map((q) => q.course_id),
                );
                const qualCount = selected.size;
                return (
                  <details key={u.id} className="rounded border border-gray-200">
                    <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50">
                      <span className="font-medium text-gray-800 text-sm">{u.name}</span>
                      <span className="text-xs text-gray-500">{qualCount} course{qualCount !== 1 ? 's' : ''}</span>
                    </summary>
                    <div className="border-t border-gray-100 px-3 py-2">
                      <form action={updateCoachQualifications}>
                        <input type="hidden" name="userId" value={u.id} />
                        <div className="grid grid-cols-1 gap-y-1 sm:grid-cols-2">
                          {courseOptions.map((course) => (
                            <label key={`${u.id}-${course.id}`} className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                name="courseIds"
                                value={course.id}
                                defaultChecked={selected.has(course.id)}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                              <span>{course.name}</span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <button className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white">Save</button>
                        </div>
                      </form>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

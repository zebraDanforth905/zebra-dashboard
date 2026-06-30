'use client';

import { updateCoachCapacity, updateCoachQualifications } from '@/app/lib/actions';
import {
  StaffScheduleCourseOption,
  StaffScheduleQualification,
  StaffScheduleUser,
} from '@/app/lib/staff-schedule-types';
import CreateUserForm from '@/app/ui/admin/create-user-form';
import UsersList from '@/app/ui/admin/users-list';
import { useRef, useState, useTransition } from 'react';

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
  currentUserId?: string | null;
};

export function SettingsView({
  users,
  courseOptions,
  qualifications,
  adminUsers,
  isAdmin,
  currentUserId,
}: SettingsViewProps) {
  const [isPending, startTransition] = useTransition();
  const [capacityByUser, setCapacityByUser] = useState<Record<string, string>>(() =>
    Object.fromEntries(users.map((u) => [u.id, String(u.coach_capacity)])),
  );
  const [savingCapacityByUser, setSavingCapacityByUser] = useState<Record<string, boolean>>({});
  const [savingQualificationsByUser, setSavingQualificationsByUser] = useState<Record<string, boolean>>({});
  const capacityTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const qualificationTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  const [selectedQualificationsByUser, setSelectedQualificationsByUser] = useState<Record<string, string[]>>(() => {
    const byUser: Record<string, string[]> = {};
    for (const user of users) {
      byUser[user.id] = qualifications
        .filter((q) => q.user_id === user.id)
        .map((q) => q.course_id);
    }
    return byUser;
  });

  function queueCapacitySave(userId: string, nextCapacityText: string) {
    if (capacityTimersRef.current[userId]) {
      clearTimeout(capacityTimersRef.current[userId]);
    }

    capacityTimersRef.current[userId] = setTimeout(() => {
      const nextCapacity = Number(nextCapacityText);
      if (!Number.isFinite(nextCapacity)) {
        return;
      }

      startTransition(async () => {
        setSavingCapacityByUser((prev) => ({ ...prev, [userId]: true }));
        try {
          const formData = new FormData();
          formData.append('userId', userId);
          formData.append('coachCapacity', String(nextCapacity));
          await updateCoachCapacity(formData);
        } finally {
          setSavingCapacityByUser((prev) => ({ ...prev, [userId]: false }));
        }
      });
    }, 500);
  }

  function queueQualificationsSave(userId: string, courseIds: string[]) {
    if (qualificationTimersRef.current[userId]) {
      clearTimeout(qualificationTimersRef.current[userId]);
    }

    qualificationTimersRef.current[userId] = setTimeout(() => {
      startTransition(async () => {
        setSavingQualificationsByUser((prev) => ({ ...prev, [userId]: true }));
        try {
          const formData = new FormData();
          formData.append('userId', userId);
          for (const courseId of courseIds) {
            formData.append('courseIds', courseId);
          }
          await updateCoachQualifications(formData);
        } finally {
          setSavingQualificationsByUser((prev) => ({ ...prev, [userId]: false }));
        }
      });
    }, 450);
  }

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
                <UsersList users={adminUsers} currentUserId={currentUserId} />
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
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          name="coachCapacity"
                          min={0}
                          max={50}
                          value={capacityByUser[u.id] ?? ''}
                          onChange={(e) => {
                            const nextValue = e.currentTarget.value;
                            setCapacityByUser((prev) => ({ ...prev, [u.id]: nextValue }));
                            queueCapacitySave(u.id, nextValue);
                          }}
                          className="w-16 rounded border border-gray-300 px-2 py-0.5 text-sm"
                        />
                        <span className="text-xs text-gray-500">
                          {savingCapacityByUser[u.id] ? 'Saving...' : 'Auto-saved'}
                        </span>
                      </div>
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
            <p className="mb-3 text-xs text-gray-500">Expand a coach to edit their qualified courses. Changes save automatically.</p>
            <div className="space-y-1">
              {users.map((u) => {
                const selected = new Set(selectedQualificationsByUser[u.id] || []);
                const qualCount = selected.size;
                return (
                  <details key={u.id} className="rounded border border-gray-200">
                    <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50">
                      <span className="font-medium text-gray-800 text-sm">{u.name}</span>
                      <span className="text-xs text-gray-500">
                        {savingQualificationsByUser[u.id] ? 'Saving...' : `${qualCount} course${qualCount !== 1 ? 's' : ''}`}
                      </span>
                    </summary>
                    <div className="border-t border-gray-100 px-3 py-2">
                      <div className="grid grid-cols-1 gap-y-1 sm:grid-cols-2">
                        {courseOptions.map((course) => (
                          <label key={`${u.id}-${course.id}`} className="flex items-center gap-2 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={selected.has(course.id)}
                              onChange={(e) => {
                                const next = new Set(selectedQualificationsByUser[u.id] || []);
                                if (e.currentTarget.checked) {
                                  next.add(course.id);
                                } else {
                                  next.delete(course.id);
                                }
                                const nextCourseIds = courseOptions
                                  .map((opt) => opt.id)
                                  .filter((id) => next.has(id));
                                setSelectedQualificationsByUser((prev) => ({ ...prev, [u.id]: nextCourseIds }));
                                queueQualificationsSave(u.id, nextCourseIds);
                              }}
                              className="h-3.5 w-3.5 rounded border-gray-300"
                            />
                            <span>{course.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </details>
      </div>

      {isPending ? <p className="text-xs text-gray-500">Saving changes...</p> : null}
    </div>
  );
}

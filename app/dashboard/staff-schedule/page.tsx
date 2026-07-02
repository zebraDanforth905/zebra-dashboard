import Link from 'next/link';
import { auth } from '@/auth';
import { getAllUsers } from '@/app/lib/actions';
import { redirect } from 'next/navigation';
import {
  fetchClassCoverageView,
  fetchFutureStaffScheduleOverview,
  fetchStaffScheduleAbsences,
  fetchStaffScheduleCourseOptions,
  fetchStaffScheduleQualifications,
  fetchStaffScheduleUsers,
  fetchTemplateViewData,
  fetchWeeklyPickupCoverageRows,
  fetchWeeklyOpenShifts,
  fetchWeeklyScheduleView,
} from '@/app/lib/staff-schedule-data';
import { ClassCoverageView } from '@/app/ui/staff-schedule/class-coverage-view';
import { FutureAlertsOverview } from '@/app/ui/staff-schedule/future-alerts-overview';
import { SettingsView } from '@/app/ui/staff-schedule/settings-view';
import { TemplateView } from '@/app/ui/staff-schedule/template-view';
import { WeeklyScheduleView } from '@/app/ui/staff-schedule/weekly-schedule-view';

type SearchParams = Promise<{
  view?: 'future' | 'weekly' | 'coverage' | 'templates' | 'settings';
  weekStart?: string;
  warningMonth?: string;
}>;

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export default async function StaffSchedulePage(props: { searchParams?: SearchParams }) {
  const searchParams = await props.searchParams;
  const view = searchParams?.view || 'weekly';
  const requestedWeekStart = searchParams?.weekStart;
  const warningMonth = searchParams?.warningMonth;
  const session = await auth();
  const isAdmin = (session?.user as any)?.user_type === 'admin';

  if (!isAdmin) {
    redirect('/dashboard');
  }

  const weekly = await fetchWeeklyScheduleView(requestedWeekStart);
  const [users, absences, openShifts, classBlocks, templateData, courseOptions, qualifications, pickupCoverageRows, allUsersResult, futureOverview] = await Promise.all([
    fetchStaffScheduleUsers(),
    fetchStaffScheduleAbsences(weekly.weekStart),
    fetchWeeklyOpenShifts(weekly.weekStart),
    fetchClassCoverageView(weekly.weekStart),
    fetchTemplateViewData(),
    fetchStaffScheduleCourseOptions(),
    fetchStaffScheduleQualifications(),
    fetchWeeklyPickupCoverageRows(weekly.weekStart),
    isAdmin ? getAllUsers() : Promise.resolve({ ok: true, users: [] }),
    fetchFutureStaffScheduleOverview(warningMonth),
  ]);

  const adminUsers = allUsersResult.ok ? (allUsersResult.users || []) : [];

  const prevWeek = shiftDate(weekly.weekStart, -7);
  const nextWeek = shiftDate(weekly.weekStart, 7);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff Scheduling</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage weekly staffing, compare class load to coach capacity, and maintain reusable weekly templates.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          className={`rounded px-3 py-2 text-sm font-medium ${
            view === 'future' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
          }`}
          href={`/dashboard/staff-schedule?view=future&weekStart=${weekly.weekStart}&warningMonth=${futureOverview.selected_month}`}
        >
          Future Staffing
        </Link>
        <Link
          className={`rounded px-3 py-2 text-sm font-medium ${
            view === 'weekly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
          }`}
          href={`/dashboard/staff-schedule?view=weekly&weekStart=${weekly.weekStart}&warningMonth=${futureOverview.selected_month}`}
        >
          Weekly Schedule
        </Link>
        <Link
          className={`rounded px-3 py-2 text-sm font-medium ${
            view === 'coverage' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
          }`}
          href={`/dashboard/staff-schedule?view=coverage&weekStart=${weekly.weekStart}&warningMonth=${futureOverview.selected_month}`}
        >
          Class Coverage
        </Link>
        <Link
          className={`rounded px-3 py-2 text-sm font-medium ${
            view === 'templates' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
          }`}
          href={`/dashboard/staff-schedule?view=templates&weekStart=${weekly.weekStart}&warningMonth=${futureOverview.selected_month}`}
        >
          Template View
        </Link>
        <Link
          className={`rounded px-3 py-2 text-sm font-medium ${
            view === 'settings' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
          }`}
          href={`/dashboard/staff-schedule?view=settings&weekStart=${weekly.weekStart}&warningMonth=${futureOverview.selected_month}`}
        >
          Staff Settings
        </Link>
      </div>

      {view !== 'future' && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            href={`/dashboard/staff-schedule?view=${view}&weekStart=${prevWeek}&warningMonth=${futureOverview.selected_month}`}
          >
            Previous Week
          </Link>
          <div className="rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800">Week of {weekly.weekStart}</div>
          <Link
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            href={`/dashboard/staff-schedule?view=${view}&weekStart=${nextWeek}&warningMonth=${futureOverview.selected_month}`}
          >
            Next Week
          </Link>
        </div>
      )}

      {view === 'future' && <FutureAlertsOverview overview={futureOverview} users={users} />}

      {view === 'weekly' && (
        <WeeklyScheduleView
          weekStart={weekly.weekStart}
          weekEnd={weekly.weekEnd}
          days={weekly.days}
          users={users}
          absences={absences}
          openShifts={openShifts}
        />
      )}
      {view === 'coverage' && <ClassCoverageView blocks={classBlocks} pickupCoverageRows={pickupCoverageRows} />}
      {view === 'templates' && <TemplateView templateData={templateData} users={users} />}
      {view === 'settings' && (
        <SettingsView
          users={users}
          courseOptions={courseOptions}
          qualifications={qualifications}
          adminUsers={adminUsers}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

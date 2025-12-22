import { Metadata } from 'next';
import { fetchShiftTemplates, fetchShifts, fetchStaffTimeOff, fetchStaffUsers } from '@/app/lib/staff-schedule-data';
import WeeklyCalendar from '@/app/ui/staff-schedule/weekly-calendar';
import TimeOffList from '@/app/ui/staff-schedule/time-off-list';
import CreateShiftUnifiedButton from '@/app/ui/staff-schedule/create-shift-unified-button';
import CreateTimeOffButton from '@/app/ui/staff-schedule/create-time-off-button';

export const metadata: Metadata = {
  title: 'Staff Schedule',
};

export default async function StaffSchedulePage() {
  const templates = await fetchShiftTemplates();
  const upcomingShifts = await fetchShifts();
  const timeOff = await fetchStaffTimeOff();
  const staffUsers = await fetchStaffUsers();

  return (
    <div className="space-y-6">
      {/* Header with Action Buttons */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Staff Schedule</h1>
          <div className="flex gap-2">
            <CreateShiftUnifiedButton staffUsers={staffUsers} />
            <CreateTimeOffButton staffUsers={staffUsers} />
          </div>
        </div>
      </div>

      {/* Weekly Calendar View */}
      <WeeklyCalendar templates={templates} shifts={upcomingShifts} staffUsers={staffUsers} />

      {/* Time Off Requests */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Staff Time Off</h2>
        </div>
        <TimeOffList timeOff={timeOff} />
      </div>
    </div>
  );
}

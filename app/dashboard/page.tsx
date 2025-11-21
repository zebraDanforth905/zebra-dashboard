import { fetchTodaySummary } from '@/app/lib/data';
import { hhmm } from '@/app/lib/utils';
import Link from 'next/link';
import { 
  CalendarIcon, 
  UserGroupIcon, 
  XMarkIcon,
  StarIcon,
  ArrowPathIcon,
  TruckIcon
} from '@heroicons/react/24/outline';
import DateSelector from '@/app/ui/dashboard/date-selector';
import { Suspense } from 'react';

export default async function Page(props: {
  searchParams?: Promise<{
    date?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const dateParam = searchParams?.date;
  
  // Parse the date correctly - if dateParam is YYYY-MM-DD, create date at noon UTC to avoid timezone issues
  let selectedDate: Date;
  if (dateParam) {
    const parts = dateParam.split('-');
    selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  } else {
    selectedDate = new Date();
  }
  
  const summary = await fetchTodaySummary(selectedDate);

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="m-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isToday ? "Today's Overview" : "Daily Overview"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {summary.weekday}, {summary.date.toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            })}
          </p>
        </div>
        <Suspense fallback={<div className="h-10 w-48 bg-slate-100 rounded-lg animate-pulse" />}>
          <DateSelector />
        </Suspense>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {/* Students */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <UserGroupIcon className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Students</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.totals.totalStudents}</p>
            </div>
          </div>
        </div>

        {/* Absences */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <XMarkIcon className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Absences</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.totals.totalAbsences}</p>
            </div>
          </div>
        </div>

        {/* Trials */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <StarIcon className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Trials</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.totals.totalTrials}</p>
            </div>
          </div>
        </div>

        {/* Makeups */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-50 rounded-lg">
              <ArrowPathIcon className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Makeups</p>
              <p className="text-2xl font-semibold text-slate-900">{summary.totals.totalMakeups}</p>
            </div>
          </div>
        </div>

        {/* Pickups */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <TruckIcon className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Pickups</p>
              <p className="text-2xl font-semibold text-slate-900">
                {summary.totals.totalPickups}
                {summary.totals.pickupAbsences > 0 && (
                  <span className="text-sm text-red-600 ml-1">
                    (-{summary.totals.pickupAbsences})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">Sessions</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {summary.sessions.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                No sessions today
              </p>
            ) : (
              summary.sessions.map((session) => (
                <div key={session.id} className="border-b border-slate-100 last:border-0">
                  <Link
                    href={`/dashboard/schedule/${session.weekday}/${session.id}`}
                    className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {hhmm(session.start_time)}–{hhmm(session.end_time)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            {session.student_count} students
                          </span>
                          {(session.absences ?? 0) > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              {session.absences} absent
                            </span>
                          )}
                          {(session.trial_count ?? 0) > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              {session.trial_count} trials
                            </span>
                          )}
                          {(session.makeup_count ?? 0) > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                              {session.makeup_count} makeups
                            </span>
                          )}
                        </div>
                      </div>
                      <svg className="h-5 w-5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                  
                  {/* Details section */}
                  {(session.absent_students && session.absent_students.length > 0) ||
                   (session.trial_students && session.trial_students.length > 0) ||
                   (session.makeup_students && session.makeup_students.length > 0) ? (
                    <div className="px-4 pb-3 space-y-3">
                      {/* Absences */}
                      {session.absent_students && session.absent_students.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-red-700 mb-1">Absent:</p>
                          <ul className="space-y-0.5">
                            {session.absent_students.map((s, i) => (
                              <li key={i} className="text-xs text-slate-600 pl-3">
                                • {s.name} <span className="text-slate-400">({s.course})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Trials */}
                      {session.trial_students && session.trial_students.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-yellow-700 mb-1">Trials:</p>
                          <ul className="space-y-0.5">
                            {session.trial_students.map((s, i) => (
                              <li key={i} className="text-xs text-slate-600 pl-3">
                                • {s.name} <span className="text-slate-400">({s.course})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Makeups */}
                      {session.makeup_students && session.makeup_students.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-sky-700 mb-1">Makeups:</p>
                          <ul className="space-y-0.5">
                            {session.makeup_students.map((s, i) => (
                              <li key={i} className="text-xs text-slate-600 pl-3">
                                • {s.name} <span className="text-slate-400">({s.course})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pickups List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">Pickups</h2>
          </div>
          <div>
            {summary.pickups.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                No pickups today
              </p>
            ) : (
              (() => {
                // Group pickups by school
                type PickupType = typeof summary.pickups[number];
                const pickupsBySchool = summary.pickups.reduce((acc, pickup) => {
                  const school = pickup.school_name || 'Unknown';
                  if (!acc[school]) acc[school] = [];
                  acc[school].push(pickup);
                  return acc;
                }, {} as Record<string, PickupType[]>);

                return Object.entries(pickupsBySchool).map(([school, pickups], schoolIndex) => (
                  <div key={school}>
                    {/* School Header */}
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-700 capitalize">{school}</h3>
                    </div>
                    
                    {/* Pickups for this school */}
                    <div className="divide-y divide-slate-100">
                      {pickups.map((pickup) => (
                        <div
                          key={pickup.id}
                          className={`px-4 py-3 ${pickup.absent ? 'opacity-40' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-medium ${pickup.absent ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                                  {pickup.name}
                                </p>
                                {pickup.absent && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                    Absent
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {pickup.teacher_name && (
                                  <span className="text-xs text-slate-500">
                                    {pickup.teacher_name}
                                  </span>
                                )}
                                {pickup.room_number && (
                                  <>
                                    {pickup.teacher_name && <span className="text-xs text-slate-300">•</span>}
                                    <span className="text-xs text-slate-500">
                                      Room {pickup.room_number}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// app/dashboard/schedule/[weekday]/pickups/page.tsx
import Link from "next/link";
import clsx from "clsx";
import { fetchPickupsForDay, fetchSessionsForDay } from "@/app/lib/data";
import PickupTableWrapper from "@/app/ui/schedule/pickup-table-wrapper";
import { PickupListDisplay } from "@/app/lib/definitions";
import AddPickupButton from "@/app/ui/schedule/add-pickup-button";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import SessionNav from "@/app/ui/schedule/session-nav";
import {
  dateForScheduleWeekday,
  isSummerScheduleWeek,
  SCHEDULE_DAYS,
  ScheduleWeekday,
  startOfScheduleWeek,
  ymdLocal,
} from "@/app/lib/schedule-week";

const SCHOOLS: PickupListDisplay["school_name"][] = ["Frankland", "Jackman"];

function isPickupSchool(value: string | undefined): value is PickupListDisplay["school_name"] {
  return SCHOOLS.includes(value as PickupListDisplay["school_name"]);
}

export default async function Page(props: {
  params?: Promise <{
    weekday?:PickupListDisplay["weekday"];
  }>,
  searchParams?: Promise<{
    school?: string;
    weekStart?: string;
  }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams
  const day = decodeURIComponent(params?.weekday ?? 'Friday') as ScheduleWeekday;
  if (!SCHEDULE_DAYS.includes(day)) notFound();
  const weekStart = ymdLocal(startOfScheduleWeek(searchParams?.weekStart));
  const targetDate = dateForScheduleWeekday(weekStart, day);
  const isSummer = isSummerScheduleWeek(weekStart);

  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const activeSchool: PickupListDisplay["school_name"] =
    isPickupSchool(searchParams?.school)
      ? searchParams.school
      : "Frankland";

  const sessions = await fetchSessionsForDay(day, targetDate);
  if (isSummer && sessions.length > 0) {
    redirect(`/dashboard/schedule/${day}/${sessions[0].id}?weekStart=${weekStart}`);
  }
  const pickups = isSummer ? [] : await fetchPickupsForDay(day, activeSchool, targetDate);

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-2">
        <SessionNav day={day} sessions={sessions} />
      </div>

      {!isSummer && (
        <>
          {/* Header with Add Pickup button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-base md:text-lg font-semibold text-slate-800">
              Pickups for {day}
            </h1>
            <AddPickupButton defaultWeekday={params?.weekday} />
          </div>

          {/* School nav and stats */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 md:px-4 py-2 md:py-3 border-b border-slate-200 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500">
                Total: <span className="font-semibold">{pickups.length}</span>
              </div>
            <div className="inline-flex rounded-full bg-slate-100 p-1">
              {SCHOOLS.map((s) => {
                const schoolParams = new URLSearchParams();
                schoolParams.set("school", s);
                schoolParams.set("weekStart", weekStart);
                const href = `?${schoolParams.toString()}`;
                const isActive = s === activeSchool;
                return (
                  <Link
                    key={s}
                    href={href}
                    className={clsx(
                      "px-3 py-1 text-xs font-medium rounded-full transition",
                      isActive
                        ? "bg-white text-sky-700 shadow-sm border border-sky-200"
                        : "text-slate-600 hover:text-sky-700"
                    )}
                  >
                    {s}
                  </Link>
                );
              })}
            </div>
          </div>

          <PickupTableWrapper day={day} pickups={pickups} currentUserName={currentUserName} />
        </>
      )}
    </div>
  );
}

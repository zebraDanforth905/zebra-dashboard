"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import {
  startOfScheduleWeek,
  summerScheduleWeekNumber,
  ymdLocal,
} from "@/app/lib/schedule-week";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function compactWeekRange(weekStart: string) {
  const start = startOfScheduleWeek(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const month = new Intl.DateTimeFormat("en-CA", { month: "short" });
  const startMonth = month.format(start);
  const endMonth = month.format(end);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startYear !== endYear) {
    return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
  }

  if (startMonth !== endMonth) {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${startYear}`;
  }

  return `${startMonth} ${startDay}-${endDay}, ${startYear}`;
}

export default function WeekSelector({ weekStart }: { weekStart: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const segments = pathname.split("/");
  const activeDay = segments[3];
  const scheduleDayPath = activeDay ? `/dashboard/schedule/${activeDay}` : pathname;

  const buildHref = (nextWeekStart: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("weekStart", nextWeekStart);
    return `${scheduleDayPath}?${params.toString()}`;
  };

  const previous = new Date(startOfScheduleWeek(weekStart));
  previous.setDate(previous.getDate() - 7);

  const next = new Date(startOfScheduleWeek(weekStart));
  next.setDate(next.getDate() + 7);

  const today = new Date();
  const todayWeekStart = ymdLocal(startOfScheduleWeek(today));
  const todayDay = WEEKDAYS[today.getDay()];
  const todayParams = new URLSearchParams(searchParams.toString());
  todayParams.set("weekStart", todayWeekStart);
  const todayHref = `/dashboard/schedule/${todayDay}?${todayParams.toString()}`;
  const summerWeekNumber = summerScheduleWeekNumber(weekStart);

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={buildHref(ymdLocal(previous))}
        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        aria-label="Previous week"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </Link>
      <div className="min-w-[9.5rem] text-center">
        <p className="whitespace-nowrap text-sm font-semibold text-slate-900">
          {compactWeekRange(weekStart)}
        </p>
        {summerWeekNumber !== null && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Summer Week {summerWeekNumber}
          </p>
        )}
      </div>
      <Link
        href={buildHref(ymdLocal(next))}
        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        aria-label="Next week"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </Link>
      <Link
        href={todayHref}
        className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Today
      </Link>
    </div>
  );
}

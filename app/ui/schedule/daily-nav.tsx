"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import RefreshScheduleButton from "./refresh-schedule-button";
import WeekSelector from "./week-selector";
import { startOfScheduleWeek, ymdLocal } from "@/app/lib/schedule-week";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function DailyNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract the active weekday segment from the path
  // Example: /dashboard/schedule/Monday/schedule → "Monday"
  const activeDay = pathname.split("/")[3] ?? ""; // 0:'',1:'dashboard',2:'schedule',3:'Monday'
  const weekStart = searchParams.get("weekStart") ?? ymdLocal(startOfScheduleWeek());

  return (
    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
      <nav aria-label="Days of the week" className="overflow-x-auto">
        <ul className="flex gap-2 min-w-max">
          <li>
            <RefreshScheduleButton weekStart={weekStart} />
          </li>
          {DAYS.map((day) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("weekStart", weekStart);
            const query = params.toString();
            const href = `/dashboard/schedule/${day}${query ? `?${query}` : ""}`;
            const active = activeDay.toLowerCase() === day.toLowerCase();

            return (
              <li key={day}>
                <Link
                  href={href}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition border",
                    active
                      ? "bg-sky-50 text-sky-700 border-sky-200 ring-1 ring-sky-100"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-sky-700"
                  )}
                >
                  <span className="whitespace-nowrap">{day}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="shrink-0 self-end xl:self-auto">
        <WeekSelector weekStart={weekStart} />
      </div>
    </div>
  );
}

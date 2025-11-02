"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function DailyNav() {
  const pathname = usePathname();

  // Extract the active weekday segment from the path
  // Example: /dashboard/schedule/Monday/schedule → "Monday"
  const activeDay = pathname.split("/")[3] ?? ""; // 0:'',1:'dashboard',2:'schedule',3:'Monday'

  return (
    <nav aria-label="Days of the week" className="overflow-x-auto">
      <ul className="flex gap-2 min-w-max">
        {DAYS.map((day) => {
          const href = `/dashboard/schedule/${day}`;
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
  );
}

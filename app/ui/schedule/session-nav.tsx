"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Session } from "@/app/lib/definitions";


function hhmm(t: string) {
  // expects "HH:MM:SS" → "HH:MM"
  return t?.slice(0,5);
}

export default function SessionNav({
  day,
  sessions,
}: {
  day: string;
  sessions: Session[];
}) {
  const pathname = usePathname(); // e.g. /dashboard/schedule/Monday/abc-uuid
  const active = pathname.split("/")[4] || ""; // [0]'',1'dashboard',2'schedule',3'days',4'sessionId?'

  return (
    <nav aria-label={`${day} sessions`} className="overflow-x-auto">
      <ul className="flex gap-2 min-w-max">
        {sessions.map((s) => {
          const href = `/dashboard/schedule/${day}/${s.id}`;
          const isActive = active === s.id;
          return (
            <li key={s.id}>
              <Link
                href={href}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition border",
                  isActive
                    ? "bg-sky-50 text-sky-700 border-sky-200 ring-1 ring-sky-100"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-sky-700"
                )}
              >
                
                <span className={clsx(
                  "grid h-7 w-7 place-items-center rounded-lg text-xs",
                  isActive ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
                )}>
                  {s.student_count ?? 0}
                </span>

                {(s.absences? s.absences > 0: s.absences)&&
                <span className={clsx(
                  "grid h-7 w-7 place-items-center rounded-lg text-xs bg-red-400",
                )}>
                  -{s.absences ?? 0}
                </span>
                }
                
                {(s.makeup_count? s.makeup_count > 0: s.makeup_count) &&
                <span className={clsx(
                  "grid h-7 w-7 place-items-center rounded-lg text-xs bg-sky-400",
                )}>
                  {s.makeup_count ?? 0}
                </span>
                } 

                {(s.trial_count? s.trial_count > 0: s.trial_count)&&
                <span className={clsx(
                  "grid h-7 w-7 place-items-center rounded-lg text-xs bg-yellow-400",
                )}>
                  {s.trial_count ?? 0}
                </span>
                }


                <span className="whitespace-nowrap">
                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

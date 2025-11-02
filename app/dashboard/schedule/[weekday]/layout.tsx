// app/dashboard/schedule/[weekday]/layout.tsx
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { fetchSessionsForDay } from "@/app/lib/data";
import SessionNav from "@/app/ui/schedule/session-nav";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] as const;
type Weekday = typeof DAYS[number];

export default async function DayLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise< {weekday: string} >;
}) {
    const weekday = (await params).weekday;
    const day = decodeURIComponent(weekday) as Weekday;

    const sessions = await fetchSessionsForDay(day);

    return (
        <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-2">
            <SessionNav day={day} sessions={sessions} />
        </div>
        {children}
        </div>
    );
}

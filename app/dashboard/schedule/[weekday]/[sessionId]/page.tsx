import ScheduleTable from "@/app/ui/schedule/schedule_row";
import SessionNav from "@/app/ui/schedule/session-nav";
import { fetchSessionsForDay } from "@/app/lib/data";
import {
  dateForScheduleWeekday,
  startOfScheduleWeek,
  ymdLocal,
} from "@/app/lib/schedule-week";
import { notFound, redirect } from "next/navigation";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] as const;
type Weekday = typeof DAYS[number];

export default async function SessionPage(props: {
  params: Promise<{ weekday: string; sessionId: string }>;
  searchParams?: Promise<{ weekStart?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const weekday = params.weekday;
  const sessionId = decodeURIComponent(params.sessionId);

  const day = decodeURIComponent(weekday) as Weekday;
  if (!DAYS.includes(day)) notFound();
  const weekStart = ymdLocal(startOfScheduleWeek(searchParams?.weekStart));
  const targetDate = dateForScheduleWeekday(weekStart, day);
  const sessions = await fetchSessionsForDay(day, targetDate);
  if (sessions.length > 0 && !sessions.some(session => session.id === sessionId)) {
    redirect(`/dashboard/schedule/${day}/${sessions[0].id}?weekStart=${weekStart}`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-2">
        <SessionNav day={day} sessions={sessions} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
        <ScheduleTable sessionId={sessionId} date={targetDate} />
      </div>
    </div>
  );
}

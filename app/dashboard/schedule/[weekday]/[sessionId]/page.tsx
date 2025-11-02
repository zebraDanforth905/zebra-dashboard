import ScheduleTable from "@/app/ui/schedule/schedule_row";
import { notFound } from "next/navigation";
// import YourStudentTableBySession from "@/app/ui/sessions/student-table-by-session";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] as const;
type Weekday = typeof DAYS[number];

export default async function SessionPage({
  params,
}: {
  params: { weekday: string; sessionId: string };
}) {
  const weekday = (await params).weekday;
  const sessionId = decodeURIComponent((await params).sessionId);

  const day = decodeURIComponent(weekday) as Weekday;
  if (!DAYS.includes(day)) notFound();

  return (
    <div className="space-y-4">

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
        {/* Placeholder until you paste your component */}
        <ScheduleTable sessionId={sessionId} />
      </div>
    </div>
  );
}

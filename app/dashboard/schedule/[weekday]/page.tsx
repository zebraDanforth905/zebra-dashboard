import { notFound } from "next/navigation";
import { fetchSessionsForDay } from "@/app/lib/data";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] as const;
type Weekday = typeof DAYS[number];

function hhmm(t: string) { return t?.slice(0,5); }

export default async function DayPage({ params }: { params: Promise<{ weekday: string }> }) {

  const weekday = (await params).weekday;

  const day = (decodeURIComponent(weekday) as Weekday);


  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      UNDER CONSTRUCTION
      <br></br>
      Will show a summary of all the absences, makeups, and trial students for {day}.
    </div>
  );
}

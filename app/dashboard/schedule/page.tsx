import { redirect } from "next/navigation";
import { connection } from "next/server";
import { startOfScheduleWeek, ymdLocal } from "@/app/lib/schedule-week";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;

export default async function Page() {
  await connection();
  const today = new Date();
  const day = DAYS[today.getDay()];
  redirect(`/dashboard/schedule/${day}?weekStart=${ymdLocal(startOfScheduleWeek(today))}`);
}

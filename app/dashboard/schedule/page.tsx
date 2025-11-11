'use client'
import { redirect } from "next/navigation";
import { Suspense } from "react";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;

export default function Page() {
  const today = new Date();
  const day = DAYS[today.getDay()];
  redirect(`/dashboard/schedule/${day}`);
}

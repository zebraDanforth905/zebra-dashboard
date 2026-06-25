


"use client";

import { useFormStatus } from "react-dom";
import { forceScheduleRefresh } from "@/app/lib/actions";
import clsx from "clsx";

// Optional props you can pass down to scope the refresh (e.g., day = "Monday")
type Props = {
  // server action: forceScheduleRefresh
  day?: string;                             // optional: refresh only one day
  weekStart?: string;
  className?: string;
  size?: "sm" | "md";
  label?: string;                           // defaults to "Refresh schedule"
};

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" d="M4 12a8 8 0 018-8v4" fill="currentColor"/>
    </svg>
  );
}

function SubmitInner({ label, size }: { label: string; size: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <>
      <span className={clsx("inline-flex items-center gap-2", pending && "opacity-90")}>
        {pending ? <Spinner /> : (
          <svg className={clsx(size === "sm" ? "h-4 w-4" : "h-5 w-5")} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {/* refresh arrow icon */}
            <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 10.001 8.001"/>
          </svg>
        )}
        <span>{pending ? "Refreshing…" : label}</span>
      </span>
    </>
  );
}

export default function RefreshScheduleButton({
  day,
  weekStart,
  className,
  size = "md",
  label = "Refresh schedule",
}: Props) {
  const padding = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm";

  return (
    <form action={forceScheduleRefresh}>
      {day ? <input type="hidden" name="day" value={day} /> : null}
      {weekStart ? <input type="hidden" name="weekStart" value={weekStart} /> : null}
      <button
        type="submit"
        className={clsx(
          "inline-flex items-center justify-center rounded-xl",
          "border border-sky-600 bg-sky-600 text-white shadow-sm",
          "hover:bg-sky-700 hover:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          padding,
          className
        )}
        aria-label={label}
      >
        <SubmitInner label={label} size={size} />
      </button>
    </form>
  );
}

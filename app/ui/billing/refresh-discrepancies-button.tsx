"use client";

import { useFormStatus } from "react-dom";
import { forceInvoiceDiscrepanciesRefresh } from "@/app/lib/actions";
import clsx from "clsx";

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

function SubmitInner() {
  const { pending } = useFormStatus();
  return (
    <>
      <span className={clsx("inline-flex items-center gap-2", pending && "opacity-90")}>
        {pending ? <Spinner /> : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {/* refresh arrow icon */}
            <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 10.001 8.001"/>
          </svg>
        )}
        <span>{pending ? "Refreshing…" : "Refresh Report"}</span>
      </span>
    </>
  );
}

export default function RefreshDiscrepanciesButton() {
  return (
    <form action={forceInvoiceDiscrepanciesRefresh}>
      <button
        type="submit"
        className={clsx(
          "inline-flex items-center justify-center rounded-xl",
          "border border-sky-600 bg-sky-600 text-white shadow-sm",
          "hover:bg-sky-700 hover:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          "px-4 py-2 text-sm"
        )}
      >
        <SubmitInner />
      </button>
    </form>
  );
}

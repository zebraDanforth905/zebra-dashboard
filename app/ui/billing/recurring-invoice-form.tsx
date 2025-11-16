"use client";

import { useId } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { RecurringInvoice } from "@/app/lib/definitions";
import { createRecurringInvoice } from "@/app/lib/actions";
import { create } from "domain";

type Props = {                         
  customer_id: string;            // create or save action (server)
  initial?: Partial<RecurringInvoice>;                   // when editing
  submitLabel?: string;                                  // e.g., "Create" or "Save changes"
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={clsx(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium",
        "border border-sky-600 bg-sky-600 text-white shadow-sm",
        "hover:bg-sky-700 hover:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300",
        "disabled:opacity-60 disabled:cursor-not-allowed"
      )}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

function DangerButton({
  label,
  onClick,
}: { label: string; onClick?: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      form="delete-form"
      onClick={onClick}
      disabled={pending}
      className={clsx(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium",
        "border border-rose-600 bg-rose-600 text-white shadow-sm",
        "hover:bg-rose-700 hover:border-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300",
        "disabled:opacity-60 disabled:cursor-not-allowed"
      )}
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}

export default function RecurringInvoiceForm({
  customer_id,
  initial,
  submitLabel = "Create recurring invoice",

}: Props) {
  const formId = useId();

  // Helpers to render options
  const dayOptions: number[] = Array.from({ length: 28 }, (_, i) => i + 1);
  dayOptions.push(-1);
  const everyOptions = [1,2,3,4,5,6,7,8,9,10,11,12];


  const defaultDay = (initial?.day_of_month ?? 1).toString();
  const defaultAmount = initial?.amount?? 0;
  const defaultEvery = String(initial?.every ?? 1);
  const defaultStart = initial?.start_date
    ? new Date(initial.start_date).toISOString().slice(0, 10)
    : ""; // yyyy-mm-dd
  const defaultEndAfter = initial?.end_after ?? null;
  const defaultDescription = initial?.description ?? "";
  
  function actionVoid(FormData: FormData){
        createRecurringInvoice(FormData);
  }

  function deleteAction(FormData: FormData){
        //deleteRecurringInvoice(FormData);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-800">
          {initial?.id ? "Edit Recurring Invoice" : "New Recurring Invoice"}
        </h2>
      </div>

      <form action={actionVoid} className="grid gap-4 p-4" id={formId}>
        {/* If editing, include the id */}
        {initial?.id && <input type="hidden" name="id" value={initial.id} />}
        <input name="customer_id" value={customer_id} readOnly hidden/>


        {/* Day of month */}
        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Day of month</span>
          <select
            name="day_of_month"
            defaultValue={defaultDay}
            required
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
                       focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            {dayOptions.map((d) => (
              <option key={d} value={d}>
                {d === -1 ? "Last day of month" : d}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            Use “Last day of month” to automatically adjust for 28–31 day months.
          </span>
        </label>

        {/* Every N months */}
        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Repeat</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Every</span>
            <select
              name="every"
              defaultValue={defaultEvery}
              className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
                         focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              {everyOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-sm text-slate-600">month(s)</span>
          </div>
        </label>

        {/* Start date */}
        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Start date</span>
          <input
            type="date"
            name="start_date"
            defaultValue={defaultStart}
            required
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
                       focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          <span className="text-xs text-slate-500">
            First invoice won’t occur before this date.
          </span>
        </label>

        {/* End after occurrences (optional) */}
        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">End after</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="end_after"
              min={1}
              step={1}
              placeholder="(optional)"
              defaultValue={defaultEndAfter as any}
              className="w-40 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
                         focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
            <span className="text-sm text-slate-600">occurrence(s)</span>
          </div>
          <span className="text-xs text-slate-500">
            Leave blank for no automatic end.
          </span>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Amount</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="amount"
              placeholder="0.0"
              defaultValue={defaultAmount as any}
              className="w-40 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
                         focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              name="description"
              placeholder="invoice descripion"
              defaultValue={defaultDescription as any}
              className="w-40 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
                         focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </label>

        {/* Actions */}
        <div className="mt-2 flex items-center gap-2">
          <SubmitButton label={initial?.id ? "Save changes" : submitLabel} />
          
          {deleteAction && initial?.id && (
            <>
              {/* separate form for delete to avoid mixing inputs */}
              <form id="delete-form" action={deleteAction}>
                <input type="hidden" name="id" value={initial.id} />
              </form>
              <DangerButton label="Delete" />
            </>
          )}*/
        </div>
      </form>
    </div>
  );
}

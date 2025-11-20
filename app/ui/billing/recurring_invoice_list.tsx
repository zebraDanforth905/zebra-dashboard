import { skipNextDate } from "@/app/lib/actions";
import { ClickableRow } from "@/app/ui/clickable-row";
import clsx from "clsx";
import { RecurringInvoiceListData } from "@/app/lib/definitions";
import { formatDate } from "@/app/lib/utils";
import { DeleteInvoiceButton, EditInvoiceButton } from "../buttons";

function formatCurrency(amount: number) {

  return (amount/100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}




export default function RecurringInvoiceTable({
  invoices,
  activeId,
}: {
  invoices: RecurringInvoiceListData[];
  activeId?: string;
}) {
  if (!invoices.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No recurring invoices yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-700">
            <th className="px-4 py-2 text-left font-semibold">Description</th>
            <th className="px-4 py-2 text-left font-semibold">Amount</th>
            <th className="px-4 py-2 text-left font-semibold">Every</th>
            <th className="px-4 py-2 text-left font-semibold">Next Date</th>
            <th className="px-4 py-2 text-left font-semibold">Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {invoices.map((inv) => {
            const href = `/dashboard/billing/recurring_invoices/${inv.id}`;
            const active = inv.id === activeId;

            return (
              <tr key={inv.id}>
                <td className="relative z-[2] px-4 py-2 font-medium text-slate-800 truncate">
                  {inv.description || "—"}
                </td>
                <td className="relative z-[2] px-4 py-2 text-slate-700">
                  {formatCurrency(inv.amount)}
                </td>
                <td className="relative z-[2] px-4 py-2 text-slate-600">
                  Every {Math.round(inv.every)} month{inv.every > 1 ? "s" : ""} on {Math.round(inv.day_of_month)}{inv.day_of_month == 1? "st": (inv.day_of_month == 2? "nd": inv.day_of_month==3? "rd": "th")}
                </td>
                <td className="relative z-[2] px-4 py-2 text-slate-600">
                  {formatDate(inv.next_date)}
                </td>
                <td className="relative z-[1] px-4 py-2 text-slate-600">
                  <form action={skipNextDate}>
                    <input name='invoiceId' value={inv.id} readOnly hidden/>
                    <input name='nextDate' value={String(inv.next_date)} readOnly hidden/>
                    <input name='dayOfMonth' value={inv.day_of_month} readOnly hidden/>
                    <input name='every' value={inv.every} readOnly hidden/>
                    <button className="hover:text-blue-200">skip next date</button>
                  </form>
                  <EditInvoiceButton id={inv.id} />
                  <DeleteInvoiceButton id={inv.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

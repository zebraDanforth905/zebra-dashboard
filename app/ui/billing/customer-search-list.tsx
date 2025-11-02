// app/dashboard/billing/[id]/edit/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";

import clsx from "clsx";
import Search from "@/app/ui/search";
import { fetchCustomersList } from "@/app/lib/data";

export const dynamic = "force-dynamic";

export default async function ({query, id}: {
    query: string;
    id: string | undefined;
}) {

    const customers = await fetchCustomersList(query);
    return (
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-3">
            <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Customers</h2>
            </div>
            <div className="mb-3">
            <Search placeholder="search customers..." />
            </div>
            <nav aria-label="Customers" className="max-h-[70vh] overflow-auto pr-1">
            <ul className="space-y-1">
                {customers.length === 0 ? (
                <li className="text-sm text-slate-500 px-2 py-2">No matches.</li>
                ) : (
                customers.map((c) => {
                    const href = `/dashboard/billing/${c.id}/edit${
                    query ? `?query=${encodeURIComponent(query)}` : ""
                    }`;
                    const active = c.id === id;
                    return (
                    <li key={c.id}>
                        <Link
                        href={href}
                        className={clsx(
                            "block rounded-xl border px-3 py-2 text-sm transition",
                            active
                            ? "border-sky-200 bg-sky-50 text-sky-800 ring-1 ring-sky-100"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-sky-700"
                        )}
                        >
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-slate-500 truncate">{c.email}</div>
                        </Link>
                    </li>
                    );
                })
                )}
            </ul>
            </nav>
        </aside>
        );
}

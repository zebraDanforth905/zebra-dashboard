// app/dashboard/schedule/[weekday]/pickups/page.tsx
import Link from "next/link";
import clsx from "clsx";
import { fetchPickupsForDay } from "@/app/lib/data";
import PickupTableWrapper from "@/app/ui/schedule/pickup-table-wrapper";
import { PickupListDisplay } from "@/app/lib/definitions";
import AddPickupButton from "@/app/ui/schedule/add-pickup-button";
import { auth } from "@/auth";

const SCHOOLS: PickupListDisplay["school_name"][] = ["Frankland", "Jackman"];

type PageProps = {
  params: { weekday: PickupListDisplay["weekday"] };
  searchParams?: { school?: string };
};

export default async function Page(props: {
  params?: Promise <{
    weekday?:PickupListDisplay["weekday"];
  }>,
  searchParams?: Promise<{
    school?: string;
  }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams

  const session = await auth();
  const currentUserName = session?.user?.name || 'Unknown User';

  const activeSchool: PickupListDisplay["school_name"] =
    SCHOOLS.includes(((searchParams)?.school as any) || "")
      ? (searchParams?.school as PickupListDisplay["school_name"])
      : "Frankland";

  const pickups = await fetchPickupsForDay(params?.weekday ?? 'Friday', activeSchool);

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Header with Add Pickup button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-base md:text-lg font-semibold text-slate-800">
          Pickups for {params?.weekday}
        </h1>
        <AddPickupButton defaultWeekday={params?.weekday} />
      </div>

      {/* School nav and stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 md:px-4 py-2 md:py-3 border-b border-slate-200 bg-slate-50 rounded-lg">
          <div className="text-xs text-slate-500">
            Total: <span className="font-semibold">{pickups.length}</span>
          </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          
          {SCHOOLS.map((s) => {
            const href = `?school=${encodeURIComponent(s)}`;
            const isActive = s === activeSchool;
            return (
              <Link
                key={s}
                href={href}
                className={clsx(
                  "px-3 py-1 text-xs font-medium rounded-full transition",
                  isActive
                    ? "bg-white text-sky-700 shadow-sm border border-sky-200"
                    : "text-slate-600 hover:text-sky-700"
                )}
              >
                {s}
              </Link>
            );
          })}
        </div>
      </div>
      

      <PickupTableWrapper day={params?.weekday ?? 'Friday'} pickups={pickups} currentUserName={currentUserName} />
    </div>
  );
}


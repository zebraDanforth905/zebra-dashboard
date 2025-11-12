// app/api/admin/scrape-now/route.ts
import { NextResponse } from "next/server";
import { syncAbsencesForCurrentWeek } from "@/app/lib/actions";
import { revalidateTag } from "next/cache";


export async function GET() {
  try {
    const result = await syncAbsencesForCurrentWeek();
    
    console.log("running the endpoint: ", result);

    revalidateTag('schedule', 'max')

    return NextResponse.json(result, { headers: { } });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });

  }
}

  
// app/api/admin/scrape-now/route.ts
import { NextResponse } from "next/server";
import { connection } from "next/server";
import { currentDateCheckRecurringInvoices, scrapeCampEnrolments, scrapeEnrolmentNow } from "@/app/lib/actions";
import { revalidateTag } from "next/cache";

export async function GET() {
  await connection();
  try {

    const result = await scrapeCampEnrolments();
    
    console.log("running the endpoint: ", result);

    return NextResponse.json({ result }, { headers: { } });
    
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

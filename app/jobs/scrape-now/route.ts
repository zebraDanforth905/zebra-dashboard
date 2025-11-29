// app/api/admin/scrape-now/route.ts
import { NextResponse } from "next/server";
import { currentDateCheckRecurringInvoices, scrapeEnrolmentNow } from "@/app/lib/actions";
import { revalidateTag } from "next/cache";


export async function GET() {
  try {

    const result = await scrapeEnrolmentNow();
    const result2 = await currentDateCheckRecurringInvoices();
    
    console.log("running the endpoint: ", result, result2);
    revalidateTag('schedule', 'max')
    revalidateTag('invoices', 'max')

    return NextResponse.json({ result, result2 }, { headers: { } });
    
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

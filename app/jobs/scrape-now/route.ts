// app/api/admin/scrape-now/route.ts
import { NextResponse } from "next/server";
import { scrapeNow } from "@/app/lib/actions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {

    const result = await scrapeNow();

    return NextResponse.json(result, { headers: { } });
    
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

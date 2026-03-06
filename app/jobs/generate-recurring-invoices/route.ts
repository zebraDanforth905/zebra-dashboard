// app/jobs/generate-recurring-invoices/route.ts
import { NextResponse } from "next/server";
import { connection } from "next/server";
import postgres from 'postgres';
import { currentDateCheckRecurringInvoices, generateInvoiceFromRecurring } from "@/app/lib/actions";
import { formatDate } from "@/app/lib/utils";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function GET() {
    await connection();

    const result = await currentDateCheckRecurringInvoices();
    return NextResponse.json(result);
    
}

'use server';
 
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import {z} from 'zod';
import { fetchReportJSON } from './scraper_helpers';
import { normalizeRows } from "@/app/lib/normalize";
import { upsertFromNormalized } from './insert_from_portal';
 
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const FormSchema = z.object({
  studentId: z.string(),
  customerId: z.string(),
});
 

 
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
    
    revalidatePath('/dashboard/billing');
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

export async function assignStudent(formData: FormData) {

  const { customerId, studentId } = FormSchema.parse({
    customerId: formData.get('customer_id'),
    studentId: formData.get('student_id'),
  });


  console.log(`Assigning student ID ${studentId} to customer ID ${formData.get('customer_id')}`);

  if (!studentId) return;
  try {
  await sql`
    UPDATE students
      SET customer_id = ${customerId}
      WHERE id = ${studentId}
    ;`;
  } catch (error) {
    console.error('Error assigning student:', error);
  }

  // After assignment, revalidate the customer edit page to reflect changes

  revalidatePath('/dashboard/billing/'+ formData.get('customer_id') +'/edit');
  revalidatePath('/dashboard/billing/'+ formData.get('customer_id') +'/edit');
  
}

export async function scrapeNow(opts?: {
  branchId?: number;
  activeId?: number;
  day?: string; // "All" | "Monday"...
  includeExtra?: boolean; // class-makeup vs class
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
}) {
  const branchId = opts?.branchId ?? Number(process.env.ZEBRA_BRANCH_ID ?? 20);
  const activeId = opts?.activeId ?? Number(process.env.ZEBRA_ACTIVE_ID ?? 1);
  const day = opts?.day ?? "All";
  const includeExtra = opts?.includeExtra ?? true;

  const endpoint = includeExtra ? "class-makeup" : "class" as const;

  const raw = await fetchReportJSON({
    endpoint,
    branchId,
    activeId,
    day,
    fromDate: opts?.fromDate,
    toDate: opts?.toDate,
  });

  const normalized = normalizeRows(raw);
  const res = await upsertFromNormalized(normalized);

  // refresh any pages that read from these tables
  revalidatePath("/dashboard");
  revalidatePath("/students");
  revalidatePath("/billing");

  return { ok: true, rows: normalized.length, ...res };
}
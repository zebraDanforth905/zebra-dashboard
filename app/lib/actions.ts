'use server';
 
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import {z} from 'zod';
import { fetchAttendanceReport, fetchEnrolmentReportJSON } from './scraper_helpers';
import { normalizeAbsencesFromAttendance, normalizeEnrolmentRows as normalizeEnrolmentRows } from "@/app/lib/normalize";
import { syncAbsencesForRange, upsertAbsences, upsertEnrolmentFromNormalized as upsertEnrolmentFromNormalized } from './insert_from_portal';
import { RecurringInvoice } from './definitions';
import { Pickup } from './definitions';
import { computeNextDate } from './utils';
import { formatDate } from './utils';
import { localMidnightFromISODate } from './utils';

import { ymd } from './utils';
 
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const AssignStudentFormSchema = z.object({
  studentId: z.string(),
  customerId: z.string(),
});
 
const NewRecurringInvoiceFormSchema = z.object({
  customer_id: z.string(),
  amount: z.coerce.number(),
  day_of_month: z.coerce.number().refine(n => (n >= 1 && n <= 28) || n === -1, "day_of_month must be 1..28 or -1"),
  every: z.coerce.number().int().positive(),
  start_date: z.coerce.date(),
  end_after: z.coerce.number(),
  description: z.string(),
}
)

const skipNextDateFormSchema = z.object({
  invoiceId: z.string(),
  nextDate: z.coerce.date(),
  dayOfMonth: z.coerce.number().refine(n => (n >= 1 && n <= 28) || n === -1, "day_of_month must be 1..28 or -1"),
  every: z.coerce.number()
})

const pickupFormSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  weekday: z.string(),
  waiver_signed: z.coerce.boolean(),
  school_name: z.string(),
  teacher_name: z.string(),
  room_number: z.string()
});

function nextDay(d: Date){
  console.log(`setting this date to next day: ${d}`)
  d.setDate(d.getDate() + 1)
  console.log(`this is the next day: ${d}`)
  return d

}
 
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
    
    revalidatePath('/dashboard/billing');
    revalidatePath('dashboard/schedule');
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

  const { customerId, studentId } = AssignStudentFormSchema.parse({
    customerId: formData.get('customer_id'),
    studentId: formData.get('student_id'),
  });

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
  revalidatePath('/dashboard/billing');
  
}

export async function unassignStudent(id: string) {

  
  if (!id) return; 
  
  try {
    await sql`
      UPDATE students
        SET customer_id = NULL
        WHERE id = ${Number(id)}
      ;`;
    } catch (error) {
      console.error('Error unassigning student:', error);
    }
    // After unassignment, revalidate the customer edit page to reflect changes
    revalidatePath('/dashboard/billing/'+ id +'/edit');
    revalidatePath('/dashboard/billing');
}

export async function scrapeEnrolmentNow(opts?: {
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

  const raw = await fetchEnrolmentReportJSON({
    endpoint,
    branchId,
    activeId,
    day,
    fromDate: opts?.fromDate,
    toDate: opts?.toDate,
  });

  const normalized = normalizeEnrolmentRows(raw);
  const res = await upsertEnrolmentFromNormalized(normalized);

  // refresh any pages that read from these tables
  revalidatePath("/dashboard", 'layout');
  revalidatePath("/students", 'layout');
  revalidatePath("/billing", 'layout');

  return { ok: true, rows: normalized.length, ...res };
}


export async function syncAbsencesForCurrentWeek(){
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 6);
  console.log({startDate, endDate})
  const branchId = Number(process.env.ZEBRA_BRANCH_ID ?? 20)
  
  const raw = await fetchAttendanceReport({
    startDate: ymd(startDate),
    endDate: ymd(endDate),
    branchId: branchId
  })

  const normalized = normalizeAbsencesFromAttendance(raw)

  const res = await syncAbsencesForRange({attendanceResults: normalized, startDate: ymd(startDate), endDate: ymd(endDate)});  

  return {ok: true, rows: normalized.length, ...res};
}

export async function createRecurringInvoice(formData: FormData) {
  const {customer_id, amount, day_of_month, every, start_date, end_after, description} = NewRecurringInvoiceFormSchema.parse({
    customer_id: formData.get('customer_id'),
    amount: formData.get('amount'),
    day_of_month: formData.get('day_of_month'),
    every: formData.get('every'),
    start_date: formData.get('start_date'),
    end_after: formData.get('end_after'),
    description: formData.get('description')
  });



  const next_date = start_date > localMidnightFromISODate((new Date()).toLocaleDateString()) ? start_date : computeNextDate({
                                                              startDate: start_date,
                                                              dayOfMonth: day_of_month,
                                                              every: every
                                                            });

  
                                                            const amount_in_cents = amount*100;

  console.log(`creating invoice ${description} ending after ${end_after} occurences`)

  
  // INSERT SQL (returns the created row)
  const rows = await sql<RecurringInvoice[]>`
    INSERT INTO recurring_invoices (
      customer_id,
      amount,
      day_of_month,
      every,
      start_date,
      next_date,
      end_after,
      description
    )
    VALUES (
      ${customer_id},
      ${amount_in_cents},
      ${day_of_month},
      ${every},
      ${start_date},
      ${next_date},
      ${end_after == 0? null : end_after},
      ${description ?? null}
    )
    RETURNING
      id,
      customer_id,
      amount,
      day_of_month,
      every,
      start_date,
      next_date,
      end_after,
      description;
    `;

  // Revalidate any pages that list recurring invoices
  revalidatePath("/dashboard/billing/[id]/edit");
  revalidatePath("/dashboard/billing");
  redirect(`/dashboard/billing/${customer_id}/edit`);

  return rows[0];
}

export async function updateRecurringInvoice(formData: FormData) {
  const {id, customer_id, amount, day_of_month, every, start_date, end_after, description} = NewRecurringInvoiceFormSchema.extend({
    id: z.string()
  }).parse({
    id: formData.get('id'),
    customer_id: formData.get('customer_id'),
    amount: formData.get('amount'),
    day_of_month: formData.get('day_of_month'),
    every: formData.get('every'),
    start_date: formData.get('start_date'),
    end_after: formData.get('end_after'),
    description: formData.get('description')
  });
  const amount_in_cents = amount*100;
  try {
    await sql`
    UPDATE recurring_invoices
      SET
        customer_id = ${customer_id},
        amount = ${amount_in_cents},
        day_of_month = ${day_of_month},
        every = ${every},
        start_date = ${start_date},
        end_after = ${end_after == 0? null : end_after},
        description = ${description ?? null}
      WHERE id = ${id};
    `;
  } catch (error) {
    console.error('Error updating recurring invoice:', error);
  }
  revalidatePath("/dashboard/billing/[id]/edit");
  revalidatePath("/dashboard/billing");
  redirect(`/dashboard/billing/${customer_id}/edit`);
}

const deleteRecurringInvoiceFormSchema = z.object({
  id: z.string()
});
export async function deleteRecurringInvoice(formData: FormData){
  const id = deleteRecurringInvoiceFormSchema.parse({
    id: formData.get('id')
  }).id;
  
  try {
    await sql`
      DELETE FROM recurring_invoices
      WHERE id = ${id};
    `;
  } catch (error) {
    console.error('Error deleting recurring invoice:', error);
  }
  revalidatePath("/dashboard/billing/[id]/edit");
  revalidatePath("/dashboard/billing");
}
export async function skipNextDate(formData: FormData){
  
  const {invoiceId, nextDate, dayOfMonth, every} = skipNextDateFormSchema.parse({
    invoiceId: formData.get('invoiceId'),
    nextDate: formData.get('nextDate'),
    dayOfMonth: formData.get('dayOfMonth'),
    every: formData.get('every')
  });

  const next_date = computeNextDate({startDate: nextDay(nextDate), dayOfMonth: dayOfMonth, every: every})


  try {
    await sql`
    UPDATE recurring_invoices
      SET next_date = ${next_date}
      WHERE id = ${invoiceId};
    `;

    revalidatePath("/dashboard/billing/[id]/edit");
    revalidatePath("/dashboard/billing");
  }catch(error){
    console.error('error skipping date: ', error);
  }

}



export async function forceScheduleRefresh(formData: FormData){
  
  await scrapeEnrolmentNow()
  await syncAbsencesForCurrentWeek()

  revalidateTag('schedule', 'max')
  
  console.log("refreshed")
}

const addPickupFormSchema = pickupFormSchema.omit({id: true});
export async function addPickup(formData: FormData){
  console.log("adding pickup with form data: ", formData);
  
  const {studentId, weekday, waiver_signed, school_name, teacher_name, room_number} = addPickupFormSchema.parse({
    studentId: formData.get('studentId'),
    weekday: formData.get('weekday'),
    waiver_signed: formData.get('waiver_signed'),
    school_name: formData.get('school_name'),
    teacher_name: formData.get('teacher_name'),
    room_number: formData.get('room_number')
  });

  console.log(`adding pickup for student ${studentId} on ${weekday}`)
  
  try {
    await sql`
    INSERT INTO pickups ( 
      student_id,
      weekday,
      waiver_signed,
      school_name,
      teacher_name,
      room_number
    )
    VALUES (
      ${studentId},
      ${weekday},
      ${waiver_signed},
      ${school_name},
      ${teacher_name ?? null},
      ${room_number ?? null}
    );
    `;
    revalidateTag("schedule", "max");
  }catch(error){
    console.error('error adding pickup: ', error);
  }
}

export async function updatePickup(formData: FormData){
  const {id, studentId, weekday, waiver_signed, school_name, teacher_name, room_number} = pickupFormSchema.parse({
    id: formData.get('id'),
    studentId: formData.get('studentId'),
    weekday: formData.get('weekday'),
    waiver_signed: formData.get('waiver_signed'),
    school_name: formData.get('school_name'),
    teacher_name: formData.get('teacher_name'),
    room_number: formData.get('room_number')
  }); 
  try {
    await sql`
    UPDATE pickups
      SET
        student_id = ${studentId},  
        weekday = ${weekday},
        waiver_signed = ${waiver_signed},
        school_name = ${school_name},
        teacher_name = ${teacher_name},
        room_number = ${room_number}
      WHERE id = ${id};
    `;

    revalidatePath("/dashboard/schedule");
  }
  catch(error){
    console.error('error updating pickup: ', error);
  }
}

const SlipInfoFormSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  student_name: z.string(),
  lms_username: z.string(),
  lms_password: z.string(),
  course_name: z.string(),
  other_fields_raw: z.string().optional().nullable()
});

export async function updateSlipInfo(formData: FormData){
  const {id, user_id, student_name, lms_username, lms_password, course_name, other_fields_raw} = SlipInfoFormSchema.parse({
    id: formData.get('id'),
    user_id: formData.get('user_id'),
    student_name: formData.get('student_name'),
    lms_username: formData.get('lms_username'),
    lms_password: formData.get('lms_password'),
    course_name: formData.get('course_name'),
    other_fields_raw: formData.get('other_fields') || ''
  });
  const other_fields = other_fields_raw ? Object.fromEntries(
    other_fields_raw.split('\n').map(line => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()];
    }).filter(([key, value]) => key && value)
  ) : {};

  try {
    await sql`
    UPDATE slip_info
      SET
        student_name = ${student_name},
        lms_username = ${lms_username},
        lms_password = ${lms_password},
        course_name = ${course_name},
        other_fields = ${Object.keys(other_fields).length > 0 ? other_fields : {}}
      WHERE id = ${id} AND user_id = ${user_id};
    `;
  } catch (error) {
    console.error('Error updating slip info:', error);
  }

  revalidatePath("/dashboard/printable");
}

const NewSlipInfoFormSchema = SlipInfoFormSchema.omit({id: true});

export async function createSlipInfo(formData: FormData){
  const {user_id, student_name, lms_username, lms_password, course_name, other_fields_raw} = NewSlipInfoFormSchema.parse({
    user_id: formData.get('user_id'),
    student_name: formData.get('student_name') || "",
    lms_username: formData.get('lms_username') || "",
    lms_password: formData.get('lms_password') || "",
    course_name: formData.get('course_name') || "",
    other_fields_raw: formData.get('other_fields')?? ""
  });
  const other_fields = other_fields_raw ? Object.fromEntries(
    other_fields_raw.split('\n').map(line => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()];
    }).filter(([key, value]) => key && value)
  ) : {};
  try {
    await sql`
    INSERT INTO slip_info (
      user_id,
      student_name,
      lms_username,
      lms_password,
      course_name,
      other_fields
    )
    VALUES (
      ${user_id},
      ${student_name},
      ${lms_username},
      ${lms_password},
      ${course_name},
      ${Object.keys(other_fields).length > 0 ? other_fields : null}
    );
    `;
    revalidatePath("/dashboard/printable");
  } catch (error) {
    console.error('Error creating slip info:', error);
  }
}

export async function deleteSlipInfo(id: string){
  try {
    await sql`
      DELETE FROM slip_info
      WHERE id = ${id};
    `;
    revalidatePath("/dashboard/printable");
  } catch (error) {
    console.error('Error deleting slip info:', error);
  }
}
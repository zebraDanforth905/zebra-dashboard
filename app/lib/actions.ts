'use server';
 
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import {z} from 'zod';
import { fetchAttendanceReport, fetchCampEnrolments, fetchEnrolmentReportJSON } from './scraper_helpers';
import { extractCustomerRows, normalizeAbsencesFromAttendance, normalizeCampEnrolments, normalizeEnrolmentRows as normalizeEnrolmentRows } from "@/app/lib/normalize";
import { insertCampEnrolments, syncAbsencesForRange, syncCustomers, syncEmailsFromFamilyView, upsertAbsences, upsertEnrolmentFromNormalized as upsertEnrolmentFromNormalized } from './insert_from_portal';
import { CampEnrolmentWithStudent, RecurringInvoice } from './definitions';
import { Pickup } from './definitions';
import { computeNextDate } from './utils';
import { formatDate } from './utils';
import { localMidnightFromISODate } from './utils';

import { ymd } from './utils';
import bcrypt from 'bcrypt';
import { auth } from '@/auth';
import { userAgent } from 'next/server';
 
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const IncidentReportFormSchema = z.object({
  incident_date: z.string().min(1, 'Date is required'),
  incident_time: z.string().min(1, 'Time is required'),
  student_name: z.string().min(1, 'Student name is required'),
  coaches: z.array(z.string()).min(1, 'At least one coach is required'),
  what_happened: z.string().min(10, 'Please describe what happened (minimum 10 characters)'),
  what_led_up: z.string().min(10, 'Please describe what led up to the incident (minimum 10 characters)'),
  other_students: z.array(z.string()).optional(),
  parent_involvement: z.string().min(10, 'Please describe parent involvement (minimum 10 characters)'),
  how_addressed: z.string().min(10, 'Please describe how the situation was addressed (minimum 10 characters)'),
});

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

const InvoiceFormSchema = z.object({
  customer_id: z.string(),
  amount: z.coerce.number(),
  date: z.coerce.date(),
  description: z.string(),
})

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
  teacher_name: z.string().optional(),
  room_number: z.string().optional(),
  comment: z.string().optional()
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
  revalidateTag('schedule', 'max')
  
}

export async function unassignStudent(id: string) {

  
  if (!id) return; 
  
  try {
    // First, get the customer_id before unassigning
    const result = await sql<{ customer_id: string }[]>`
      SELECT customer_id FROM students WHERE id = ${Number(id)}
    `;
    const customerId = result[0]?.customer_id;
    
    // Now unassign the student
    await sql`
      UPDATE students
        SET customer_id = NULL
        WHERE id = ${Number(id)}
      ;`;
      
    // Revalidate the customer's edit page if they had a customer
    if (customerId) {
      revalidatePath(`/dashboard/billing/${customerId}/edit`);
    }
    revalidatePath('/dashboard/billing');
    revalidateTag('schedule', 'max');
    } catch (error) {
      console.error('Error unassigning student:', error);
    }
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

  const customerRows = extractCustomerRows(raw);
  const customerRes = await syncCustomers(customerRows);

  // Portal-authoritative email sync from /family-view/{id}: pulls real
  // primary + alternate emails per family. Runs after syncCustomers so every
  // customer with portal_parent_id is refreshed.
  const emailRes = await syncEmailsFromFamilyView();

  // refresh any pages that read from these tables
  revalidatePath("/dashboard", 'layout');
  revalidatePath("/students", 'layout');
  revalidatePath("/billing", 'layout');

  return { ok: true, rows: normalized.length, customers: customerRes, emails: emailRes, ...res };
}

export async function scrapeCampEnrolments(opts?: {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  branchId?: number;
}) {
  const branchId = opts?.branchId ?? Number(process.env.ZEBRA_BRANCH_ID ?? 20);
  
  // Default to current date if not provided
  const today = new Date();
  const startDate = opts?.startDate ?? ymd(today);
  const endDate = opts?.endDate ?? ymd(new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)); // 1 year from now

  const raw = await fetchCampEnrolments({
    startDate,
    endDate,
    branchId,
  });

  const normalized = normalizeCampEnrolments(raw);
  const res = await insertCampEnrolments(normalized, { startDate, endDate });

  const customerRows = extractCustomerRows(raw);
  const customerRes = await syncCustomers(customerRows);

  // refresh any pages that read from these tables
  revalidatePath("/dashboard", 'layout');
  revalidatePath("/students", 'layout');
  revalidatePath("/camp", 'layout');

  return { ok: true, rows: normalized.length, customers: customerRes, ...res };
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

  // Get today's date at midnight for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // If start_date is in the future, use it as next_date; otherwise compute the next occurrence
  const next_date = start_date >= today ? start_date : computeNextDate({
    startDate: start_date,
    dayOfMonth: day_of_month,
    every: every
  });
  
  const amount_in_cents = amount * 100;

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
  
  const amount_in_cents = amount * 100;
  
  try {
    // Fetch the existing invoice to check if start_date changed
    const existingInvoice = await sql<RecurringInvoice[]>`
      SELECT start_date, next_date FROM recurring_invoices WHERE id = ${id}
    `;
    
    if (existingInvoice.length === 0) {
      throw new Error('Recurring invoice not found');
    }
    
    const oldStartDate = new Date(existingInvoice[0].start_date);
    oldStartDate.setHours(0, 0, 0, 0);
    
    const newStartDate = new Date(start_date);
    newStartDate.setHours(0, 0, 0, 0);
    
    // Only recalculate next_date if start_date has changed
    let next_date = existingInvoice[0].next_date;
    
    if (oldStartDate.getTime() !== newStartDate.getTime()) {
      // Get today's date at midnight for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // If start_date is in the future, use it as next_date; otherwise compute the next occurrence
      next_date = start_date >= today ? start_date : computeNextDate({
        startDate: start_date,
        dayOfMonth: day_of_month,
        every: every
      });
    }
    
    await sql`
    UPDATE recurring_invoices
      SET
        customer_id = ${customer_id},
        amount = ${amount_in_cents},
        day_of_month = ${day_of_month},
        every = ${every},
        start_date = ${start_date},
        next_date = ${next_date},
        end_after = ${end_after == 0? null : end_after},
        description = ${description ?? null}
      WHERE id = ${id};
    `;
  } catch (error) {
    console.error('Error updating recurring invoice:', error);
    throw new Error('Failed to update recurring invoice.');
  }
  revalidatePath("/dashboard/billing/[id]/edit");
  revalidatePath("/dashboard/billing");
}

export async function createInvoice(formData: FormData){
  const {customer_id, amount, date, description} = InvoiceFormSchema.parse({
    customer_id: formData.get('customer_id'),
    amount: formData.get('amount'),
    date: formData.get('date'),
    description: formData.get('description')
  });

  const amount_in_cents = Math.round(amount * 100);

  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, date, description)
      VALUES (${customer_id}, ${amount_in_cents}, ${date}, ${description})
    `;
    
    revalidatePath('/dashboard/billing/[id]/edit');
    revalidatePath('/dashboard/billing');
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw new Error('Failed to create invoice.');
  }
}

export async function updateInvoice(formData: FormData){
  const {id, customer_id, amount, date, description} = InvoiceFormSchema.extend({
    id: z.string()
  }).parse({
    id: formData.get('id'),
    customer_id: formData.get('customer_id'),
    amount: formData.get('amount'),
    date: formData.get('date'),
    description: formData.get('description')
  });

  const amount_in_cents = Math.round(amount * 100);

  try {
    await sql`
      UPDATE invoices
      SET amount = ${amount_in_cents},
          date = ${date},
          description = ${description}
      WHERE id = ${id}
    `;
    
    revalidatePath('/dashboard/billing/[id]/edit');
    revalidatePath('/dashboard/billing');
  } catch (error) {
    console.error('Error updating invoice:', error);
    throw new Error('Failed to update invoice.');
  }
}

export async function deleteInvoice(formData: FormData){
  const id = z.string().parse(formData.get('id'));
  
  try {
    await sql`
      DELETE FROM invoices
      WHERE id = ${id};
    `;
    
    revalidatePath('/dashboard/billing/[id]/edit');
    revalidatePath('/dashboard/billing');
  } catch (error) {
    console.error('Error deleting invoice:', error);
    throw new Error('Failed to delete invoice.');
  }
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

export async function forceInvoiceDiscrepanciesRefresh() {
  revalidateTag('invoices', 'max');
  revalidateTag('customers', 'max');
  console.log("Invoice discrepancies cache refreshed");
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
    revalidateTag('invoices', 'max');
  }catch(error){
    console.error('error skipping date: ', error);
  }

}

export async function generateInvoiceFromRecurring(formData: FormData) {
  const recurringInvoiceId = z.string().parse(formData.get('recurringInvoiceId'));
  
  try {
    // Fetch the recurring invoice
    const recurringInvoices = await sql<RecurringInvoice[]>`
      SELECT id, customer_id, amount, day_of_month, every, next_date, description, end_after
      FROM recurring_invoices
      WHERE id = ${recurringInvoiceId}
    `;
    
    if (recurringInvoices.length === 0) {
      throw new Error('Recurring invoice not found');
    }
    
    const recurring = recurringInvoices[0];
    
    // Create a regular invoice with the next_date, amount, and description
    await sql`
      INSERT INTO invoices (customer_id, amount, date, description)
      VALUES (${recurring.customer_id}, ${recurring.amount}, ${recurring.next_date}, ${recurring.description})
    `;
    
    // Handle end_after logic
    if (recurring.end_after !== null) {
      const newEndAfter = recurring.end_after - 1;
      
      if (newEndAfter <= 0) {
        // Delete the recurring invoice if it has exhausted its occurrences
        await sql`
          DELETE FROM recurring_invoices
          WHERE id = ${recurring.id}
        `;
        console.log(`Deleted recurring invoice ${recurring.id} after reaching end_after limit`);
      } else {
        // Decrement end_after and update next_date
        const next_date = computeNextDate({
          startDate: nextDay(recurring.next_date), 
          dayOfMonth: recurring.day_of_month, 
          every: recurring.every
        });
        
        await sql`
          UPDATE recurring_invoices
          SET next_date = ${next_date},
              end_after = ${newEndAfter}
          WHERE id = ${recurring.id}
        `;
        console.log(`Updated recurring invoice ${recurring.id}: end_after = ${newEndAfter}, next_date = ${next_date}`);
      }
    } else {
      // No end_after limit, just update next_date as before
      const skipFormData = new FormData();
      skipFormData.append('invoiceId', recurring.id);
      skipFormData.append('nextDate', recurring.next_date.toString());
      skipFormData.append('dayOfMonth', recurring.day_of_month.toString());
      skipFormData.append('every', recurring.every.toString());
      
      await skipNextDate(skipFormData);
    }
    
    // Revalidate cache
    revalidatePath("/dashboard/billing/[id]/edit");
    revalidatePath("/dashboard/billing");
    revalidateTag('invoices', 'max');
  } catch (error) {
    console.error('Error generating invoice from recurring:', error);
    throw new Error('Failed to generate invoice.');
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
  
  const {studentId, weekday, waiver_signed, school_name, teacher_name, room_number, comment} = addPickupFormSchema.parse({
    studentId: formData.get('studentId'),
    weekday: formData.get('weekday'),
    waiver_signed: formData.get('waiver_signed'),
    school_name: formData.get('school_name'),
    teacher_name: formData.get('teacher_name'),
    room_number: formData.get('room_number'),
    comment: formData.get('comment')
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
      room_number,
      comment
    )
    VALUES (
      ${studentId},
      ${weekday},
      ${waiver_signed},
      ${school_name},
      ${teacher_name ?? null},
      ${room_number ?? null},
      ${comment ?? null}
    );
    `;
    revalidateTag("schedule", "max");
  }catch(error){
    console.error('error adding pickup: ', error);
  }
}

export async function updatePickup(formData: FormData){
  const {id, studentId, weekday, waiver_signed, school_name, teacher_name, room_number, comment} = pickupFormSchema.parse({
    id: formData.get('id'),
    studentId: formData.get('studentId'),
    weekday: formData.get('weekday'),
    waiver_signed: formData.get('waiver_signed'),
    school_name: formData.get('school_name'),
    teacher_name: formData.get('teacher_name'),
    room_number: formData.get('room_number'),
    comment: formData.get('comment')
  }); 
  try {
    await sql`
    UPDATE pickups
      SET
        student_id = ${studentId},  
        weekday = ${weekday},
        waiver_signed = ${waiver_signed},
        school_name = ${school_name},
        teacher_name = ${teacher_name || null},
        room_number = ${room_number || null},
        comment = ${comment || null}
      WHERE id = ${id};
    `;

    revalidatePath("/dashboard/schedule");
  }
  catch(error){
    console.error('error updating pickup: ', error);
  }
}

export async function deletePickup(pickupId: string) {
  try {
    await sql`
      DELETE FROM pickups
      WHERE id = ${pickupId};
    `;
    revalidatePath("/dashboard/schedule");
  } catch (error) {
    console.error('error deleting pickup: ', error);
    throw error;
  }
}

export async function markPickupAbsence(pickupId: string, date: Date) {
  try {
    // Check if absence already exists
    console.log(`checking existing absence for pickup ${pickupId} on date ${date.toISOString().split('T')[0]}`);
    const existing = await sql`
      SELECT id FROM pickup_absences
      WHERE pickup_id = ${pickupId} AND date = ${date.toISOString().split('T')[0]};
    `;
    
    if (existing.length === 0) {
      console.log(`marking absence for pickup ${pickupId} on date ${date.toISOString().split('T')[0]}`);
      await sql`
        INSERT INTO pickup_absences (pickup_id, date)
        VALUES (${pickupId}, ${date.toISOString().split('T')[0]});
      `;
    }
    
    revalidatePath("/dashboard/schedule");
  } catch (error) {
    console.error('error marking pickup absence: ', error);
    throw error;
  }
}

export async function unmarkPickupAbsence(pickupId: string, date: Date) {
  try {
    await sql`
      DELETE FROM pickup_absences
      WHERE pickup_id = ${pickupId} AND date = ${date.toISOString().split('T')[0]};
    `;
    
    revalidatePath("/dashboard/schedule");
  } catch (error) {
    console.error('error unmarking pickup absence: ', error);
    throw error;
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

export async function assignStudentToScratchAccount(scratchUsername: string, studentId: string | null) {
  try {
    await sql`
      UPDATE scratch_accounts
      SET student_id = ${studentId}
      WHERE username = ${scratchUsername};
    `;
    revalidatePath('/dashboard/scratch-accounts');
  } catch (error) {
    console.error('Error assigning student to scratch account:', error);
    throw new Error('Failed to assign student to scratch account.');
  }
}

export async function assignStudentToRobloxAccount(robloxUsername: string, studentId: string | null) {
  try {
    await sql`
      UPDATE roblox_accounts
      SET student_id = ${studentId}
      WHERE username = ${robloxUsername};
    `;
    revalidatePath('/dashboard/scratch-accounts');
  } catch (error) {
    console.error('Error assigning student to roblox account:', error);
    throw new Error('Failed to assign student to roblox account.');
  }
}

export async function assignStudentToLaptop(laptopNumber: string, studentId: string | null) {
  try {
    await sql`
      UPDATE laptop_assignments
      SET student_id = ${studentId}
      WHERE laptop_number = ${laptopNumber};
    `;
    revalidatePath('/dashboard/scratch-accounts');
  } catch (error) {
    console.error('Error assigning student to laptop:', error);
    throw new Error('Failed to assign student to laptop.');
  }
}

export async function createScratchAccount(username: string, password: string, studentId: string | null = null) {
  try {
    await sql`
      INSERT INTO scratch_accounts (username, password, student_id)
      VALUES (${username}, ${password}, ${studentId});
    `;
    revalidatePath('/dashboard/scratch-accounts');
  } catch (error) {
    console.error('Error creating scratch account:', error);
    throw new Error('Failed to create scratch account.');
  }
}

export async function createRobloxAccount(username: string, password: string, studentId: string | null = null) {
  try {
    await sql`
      INSERT INTO roblox_accounts (username, password, student_id)
      VALUES (${username}, ${password}, ${studentId});
    `;
    revalidatePath('/dashboard/scratch-accounts');
  } catch (error) {
    console.error('Error creating roblox account:', error);
    throw new Error('Failed to create roblox account.');
  }
}

export async function createLaptopAssignment(laptopNumber: string, studentId: string) {
  try {
    await sql`
      INSERT INTO laptop_assignments (laptop_number, student_id)
      VALUES (${laptopNumber}, ${studentId});
    `;
    revalidatePath('/dashboard/scratch-accounts');
  } catch (error) {
    console.error('Error creating laptop assignment:', error);
    throw new Error('Failed to create laptop assignment.');
  }
}

export async function createStudentNote(studentId: string, content: string, creator: string) {
  try {
    await sql`
      INSERT INTO student_notes (student_id, content, creator, date)
      VALUES (${studentId}, ${content}, ${creator}, NOW());
    `;
    revalidateTag('studentsnotes', 'max');
    revalidatePath('/dashboard/students');
    
  } catch (error) {
    console.error('Error creating student note:', error);
    throw new Error('Failed to create student note.');
  }
}

export async function deleteStudentNote(noteId: string) {
  try {
    await sql`
      DELETE FROM student_notes
      WHERE id = ${noteId};
    `;
    revalidateTag('studentsnotes', 'max');
    revalidatePath('/dashboard/students');
   
  } catch (error) {
    console.error('Error deleting student note:', error);
    throw new Error('Failed to delete student note.');
  }
}

export async function createCustomerNote(customerId: string, content: string, creator: string) {
  try {
    await sql`
      INSERT INTO customer_notes (customer_id, content, creator)
      VALUES (${customerId}, ${content}, ${creator});
    `;
    revalidatePath('/dashboard/billing');
    revalidatePath(`/dashboard/billing/${customerId}/edit`);
    revalidatePath('/dashboard/billing/invoice-discrepancies');
  } catch (error) {
    console.error('Error creating customer note:', error);
    throw new Error('Failed to create customer note.');
  }
}

export async function deleteCustomerNote(noteId: string, customerId: string) {
  try {
    await sql`
      DELETE FROM customer_notes
      WHERE id = ${noteId};
    `;
    revalidatePath('/dashboard/billing');
    revalidatePath(`/dashboard/billing/${customerId}/edit`);
    revalidatePath('/dashboard/billing/invoice-discrepancies');
  } catch (error) {
    console.error('Error deleting customer note:', error);
    throw new Error('Failed to delete customer note.');
  }
}

export async function createTrialNote(trialId: string, content: string, creator: string) {
  try {
    await sql`
      INSERT INTO trial_notes (trial_id, content, creator, date)
      VALUES (${trialId}, ${content}, ${creator}, NOW());
    `;
    revalidateTag('studentsnotes', 'max');
    revalidatePath('/dashboard/schedule');
  } catch (error) {
    console.error('Error creating trial note:', error);
    throw new Error('Failed to create trial note.');
  }
}

export async function deleteTrialNote(noteId: string) {
  try {
    await sql`
      DELETE FROM trial_notes
      WHERE id = ${noteId};
    `;
    revalidateTag('studentsnotes', 'max');
    revalidatePath('/dashboard/schedule');
  } catch (error) {
    console.error('Error deleting trial note:', error);
    throw new Error('Failed to delete trial note.');
  }
}

type CSVRow = {
  'Recurring ID': string;
  'Amount': string;
  'Billing Cycle': string;
  'Last Name': string;
  'Email': string;
  'Phone': string;
  'Exp Date': string;
  'Start Date': string;
  'Last Payment': string;
  'Next Payment': string;
  'Description': string;
};

type UnmatchedRecurring = {
  recurring_id: string;
  amount: number;
  billing_cycle: string;
  last_name: string;
  email: string;
  phone: string;
  exp_date: Date | null;
  start_date: Date | null;
  last_payment: Date | null;
  next_payment: Date | null;
  description: string;
};

export async function uploadRecurringPaymentsCSV(csvContent: string): Promise<{ success: boolean; unmatched: UnmatchedRecurring[] }> {
  try {
    // Parse CSV content
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    
    const unmatched: UnmatchedRecurring[] = [];
    const recurringIdsInCSV: string[] = [];
    let matchedCount = 0;

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      // Parse CSV row (handle quoted fields)
      const values: string[] = [];
      let currentValue = '';
      let insideQuotes = false;
      
      for (let char of lines[i]) {
        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim()); // Add last value

      // Create row object
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      const recurringId = row['Recurring ID'];
      recurringIdsInCSV.push(recurringId);

      // Parse dates (MM/YY format for exp_date, dates in other formats)
      const parseExpDate = (dateStr: string): Date | null => {
        if (!dateStr || !dateStr.trim()) return null;
        try {
          const date = new Date(2000 + parseInt(dateStr.substring(dateStr.length - 2)), parseInt(dateStr.substring(0, dateStr.length-2)) - 1, 1);
          return isNaN(date.getTime()) ? null : date;
        } catch {
          return null;
        }
      };

      const parseDate = (dateStr: string): Date | null => {
        if (!dateStr || !dateStr.trim()) return null;
        try {
          const date = new Date(dateStr);
          return isNaN(date.getTime()) ? null : date;
        } catch {
          return null;
        }
      };

      const paymentData = {
        amount: parseFloat(row['Amount']) || 0,
        billing_cycle: row['Billing Cycle'],
        last_name: row['Last Name'],
        email: row['Email'],
        phone: row['Phone'],
        exp_date: parseExpDate(row['Exp Date']),
        start_date: parseDate(row['Start Date']),
        last_payment: parseDate(row['Last Payment']),
        next_payment: parseDate(row['Next Payment']),
        recurring_id: recurringId,
        description: row['Description'],
      };

      // Check if this recurring_id already exists in the database
      const existing = await sql`
        SELECT customer_id FROM converge_recurring_payments
        WHERE recurring_id = ${recurringId};
      `;

      if (existing.length > 0) {
        // Recurring ID exists - update the row with new data, keeping the same customer_id
        try {
          await sql`
            UPDATE converge_recurring_payments
            SET 
              amount = ${paymentData.amount},
              billing_cycle = ${paymentData.billing_cycle},
              last_name = ${paymentData.last_name},
              email = ${paymentData.email},
              phone = ${paymentData.phone},
              exp_date = ${paymentData.exp_date},
              start_date = ${paymentData.start_date},
              last_payment = ${paymentData.last_payment},
              next_payment = ${paymentData.next_payment},
              description = ${paymentData.description}
            WHERE recurring_id = ${recurringId};
          `;
          matchedCount++;
        } catch (rowError) {
          console.error(`Error updating recurring_id ${recurringId}:`, rowError);
          unmatched.push(paymentData);
        }
      } else {
        // Recurring ID doesn't exist - try to auto-match by email
        let autoMatched = false;
        
        if (paymentData.email && paymentData.email.trim()) {
          try {
            // Look for customer with matching email (primary or alternate)
            const customerMatch = await sql`
              SELECT id FROM customers
              WHERE LOWER(email) = LOWER(${paymentData.email.trim()})
                 OR LOWER(alternate_email) = LOWER(${paymentData.email.trim()})
              LIMIT 1;
            `;
            
            if (customerMatch.length > 0) {
              // Found matching customer - auto-assign
              const customerId = customerMatch[0].id;
              await sql`
                INSERT INTO converge_recurring_payments (
                  recurring_id, customer_id, amount, billing_cycle, last_name, 
                  email, phone, exp_date, start_date, last_payment, next_payment, description
                ) VALUES (
                  ${recurringId}, ${customerId}, ${paymentData.amount}, ${paymentData.billing_cycle},
                  ${paymentData.last_name}, ${paymentData.email}, ${paymentData.phone},
                  ${paymentData.exp_date}, ${paymentData.start_date}, ${paymentData.last_payment},
                  ${paymentData.next_payment}, ${paymentData.description}
                );
              `;
              matchedCount++;
              autoMatched = true;
              console.log(`Auto-matched recurring payment ${recurringId} to customer ${customerId} by email`);
            }
          } catch (matchError) {
            console.error(`Error auto-matching recurring_id ${recurringId}:`, matchError);
          }
        }
        
        if (!autoMatched) {
          // Couldn't auto-match - add to unmatched list for manual assignment
          unmatched.push(paymentData);
        }
      }
    }

    // Delete any recurring payments that are NOT in the CSV (cancelled/ended subscriptions)
    if (recurringIdsInCSV.length > 0) {
      try {
        // Use UNNEST to properly handle array in NOT IN clause
        const deleteResult = await sql`
          DELETE FROM converge_recurring_payments
          WHERE recurring_id NOT IN (
            SELECT UNNEST(${recurringIdsInCSV}::text[])
          )
          RETURNING recurring_id;
        `;
        console.log(`Deleted ${deleteResult.length} recurring payments not in CSV`);
      } catch (deleteError) {
        console.error('Error deleting old recurring payments:', deleteError);
      }
    }

    console.log(`Updated ${matchedCount} recurring payments, ${unmatched.length} unmatched`);
    revalidatePath('/dashboard/billing');
    
    return { success: true, unmatched };
  } catch (error) {
    console.error('Error uploading recurring payments CSV:', error);
    throw new Error('Failed to upload recurring payments CSV.');
  }
}

export async function assignRecurringPaymentToCustomer(recurringId: string, customerId: string, paymentData: UnmatchedRecurring) {
  try {
    // Insert the new recurring payment for this customer
    // (no UNIQUE constraint on customer_id, so customers can have multiple recurring payments)
    await sql`
      INSERT INTO converge_recurring_payments (
        recurring_id, customer_id, amount, billing_cycle, last_name, 
        email, phone, exp_date, start_date, last_payment, next_payment, description
      ) VALUES (
        ${recurringId}, ${customerId}, ${paymentData.amount}, ${paymentData.billing_cycle},
        ${paymentData.last_name}, ${paymentData.email}, ${paymentData.phone},
        ${paymentData.exp_date}, ${paymentData.start_date}, ${paymentData.last_payment},
        ${paymentData.next_payment}, ${paymentData.description}
      );
    `;

    revalidatePath('/dashboard/billing');
  } catch (error) {
    console.error('Error assigning recurring payment:', error);
    throw new Error('Failed to assign recurring payment to customer.');
  }
}

export async function createCustomer(name: string, email: string): Promise<{ id: string; name: string; email: string }> {
  try {
    if (!name || !name.trim()) {
      throw new Error('Customer name is required');
    }

    const result = await sql<{ id: string; name: string; email: string }[]>`
      INSERT INTO customers (name, email)
      VALUES (${name.trim()}, ${email?.trim() || ''})
      RETURNING id, name, email
    `;

    revalidatePath('/dashboard/billing');
    return result[0];
  } catch (error) {
    console.error('Error creating customer:', error);
    throw new Error('Failed to create customer.');
  }
}

// Helper function to generate recurring invoice for a newly assigned student
async function generateRecurringInvoiceForStudent(studentId: string, customerId: string) {
  try {
    // Get student name and calculate their enrollment costs
    const studentData = await sql`
      SELECT 
        s.name as student_name,
        COALESCE(SUM(co.price), 0) as total_enrollment_cost,
        COUNT(DISTINCT e.id) as enrollment_count
      FROM students s
      LEFT JOIN enrolments e ON e.student_id = s.id
      LEFT JOIN courses co ON co.id = e.course_id
      WHERE s.id = ${studentId}
      GROUP BY s.name
    `;

    // Calculate pickup costs for this student ($40 per weekday)
    const pickupData = await sql`
      SELECT 
        COUNT(DISTINCT p.weekday) FILTER (WHERE p.id IS NOT NULL) * 40 as total_pickup_cost,
        COUNT(DISTINCT p.weekday) FILTER (WHERE p.id IS NOT NULL) as pickup_count
      FROM pickups p
      WHERE p.student_id = ${studentId}
    `;

    const studentName = studentData[0]?.student_name || 'Student';
    const enrollmentCost = Number(studentData[0]?.total_enrollment_cost) || 0;
    const pickupCost = Number(pickupData[0]?.total_pickup_cost) || 0;
    const totalMonthlyFee = enrollmentCost + pickupCost;
    const enrollmentCount = studentData[0]?.enrollment_count || 0;
    const pickupCount = pickupData[0]?.pickup_count || 0;

    console.log(`DEBUG - Student: ${studentName}, enrollmentCost: ${enrollmentCost} (type: ${typeof enrollmentCost}), pickupCost: ${pickupCost}, totalMonthlyFee: ${totalMonthlyFee}`);

    // Calculate first of next month
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const startDate = nextMonth.toISOString().split('T')[0];

    const description = `Monthly fee for ${studentName}: ${enrollmentCount} enrollment(s), ${pickupCount} pickup(s)`;
    const amount = totalMonthlyFee * 100; // Convert dollars to cents
    
    console.log(`DEBUG: amount stored in DB will be: ${amount}`);

    if (totalMonthlyFee > 0) {
      // Create new recurring invoice for this student starting first of next month
      await sql`
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
          ${customerId},
          ${amount},
          1,
          1,
          ${startDate},
          ${startDate},
          NULL,
          ${description}
        )
      `;
      console.log(`Created recurring invoice for student ${studentName} (customer ${customerId}): $${totalMonthlyFee.toFixed(2)}/month starting ${startDate}`);
    } else {
      console.log(`No recurring invoice created for student ${studentName} - no enrollments or pickups`);
    }
  } catch (error) {
    console.error('Error generating recurring invoice for student:', error);
    // Don't throw - we don't want to fail the student assignment if invoice creation fails
  }
}

export async function assignStudentToCustomer(studentId: string, customerId: string) {
  try {
    await sql`
      UPDATE students
      SET customer_id = ${customerId}
      WHERE id = ${studentId};
    `;

    // Generate recurring invoice for this newly assigned student
    await generateRecurringInvoiceForStudent(studentId, customerId);

    revalidatePath('/dashboard/billing');
    revalidateTag('invoices', 'max');
  } catch (error) {
    console.error('Error assigning student to customer:', error);
    throw new Error('Failed to assign student to customer.');
  }
}

export async function updateCustomer(
  customerId: string,
  name: string,
  email: string,
  alternateName?: string,
  alternateEmail?: string,
) {
  try {
    if (!name || !name.trim()) {
      throw new Error('Customer name is required');
    }

    await sql`
      UPDATE customers
      SET
        name = ${name.trim()},
        email = ${email?.trim() || ''},
        alternate_name = ${alternateName?.trim() || null},
        alternate_email = ${alternateEmail?.trim().toLowerCase() || null}
      WHERE id = ${customerId};
    `;

    revalidatePath('/dashboard/billing');
    revalidatePath(`/dashboard/billing/${customerId}/edit`);
  } catch (error) {
    console.error('Error updating customer:', error);
    throw new Error('Failed to update customer.');
  }
}

export async function toggleCustomerQBO(customerId: string, currentValue: boolean) {
  try {
    await sql`
      UPDATE customers
      SET set_up_qbo = ${!currentValue}
      WHERE id = ${customerId};
    `;

    revalidatePath('/dashboard/billing');
  } catch (error) {
    console.error('Error toggling QBO status:', error);
    throw new Error('Failed to toggle QBO status.');
  }
}

type UnmatchedPayment = {
  customer_full_name: string;
  amount: number;
  transaction_date: Date;
  description: string;
  transaction_id: string;
};

export async function uploadSettledBatchCSV(csvContent: string): Promise<{ matched: number; unmatched: UnmatchedPayment[] }> {
  try {
    const lines = csvContent.trim().split('\n');
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Parse CSV header
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    
    // Find column indices
    const nameIdx = headers.indexOf('Customer Full Name');
    const emailIdx = headers.indexOf('Email Address');
    const amountIdx = headers.indexOf('Amount');
    const dateIdx = headers.indexOf('Transaction Date');
    const descIdx = headers.indexOf('Description');
    const txnIdIdx = headers.indexOf('Transaction ID');
    const statusIdx = headers.indexOf('Transaction Status');

    if (emailIdx === -1 || amountIdx === -1 || dateIdx === -1) {
      throw new Error('CSV is missing required columns (Email Address, Amount, Transaction Date)');
    }

    const unmatched: UnmatchedPayment[] = [];
    let matched = 0;

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse CSV line with quote handling
      const fields: string[] = [];
      let currentField = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          fields.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }
      fields.push(currentField.trim());

      const customerName = fields[nameIdx]?.replace(/"/g, '').trim();
      const customerEmail = fields[emailIdx]?.replace(/"/g, '').trim();
      const amountStr = fields[amountIdx]?.replace(/"/g, '').trim();
      const dateStr = fields[dateIdx]?.replace(/"/g, '').trim();
      const description = fields[descIdx]?.replace(/"/g, '').trim() || '';
      const transactionId = fields[txnIdIdx]?.replace(/"/g, '').trim() || '';
      const status = fields[statusIdx]?.replace(/"/g, '').trim();

      if (!customerEmail || !amountStr || !dateStr || status !== 'Settled') continue;

      const amount = Math.round(parseFloat(amountStr) * 100); // Convert to cents
      const transactionDate = new Date(dateStr);

      if (isNaN(amount) || isNaN(transactionDate.getTime())) continue;

      // Try to match customer by email (case-insensitive)
      const customers = await sql<{ id: string; name: string; email: string }[]>`
        SELECT id, name, email
        FROM customers 
        WHERE LOWER(email) = LOWER(${customerEmail})
        LIMIT 1;
      `;

      if (customers.length > 0) {
        // Match found by email - insert payment
          await sql`
            INSERT INTO payments (transaction_id, customer_id, amount, date, status, comment)
            VALUES (${transactionId}, ${customers[0].id}, ${amount}, ${transactionDate}, 'submitted', ${description})
            ON CONFLICT (transaction_id) DO UPDATE SET
              comment = EXCLUDED.comment;
          `;
        matched++;
      } else {
        // No email match - add to unmatched list
        unmatched.push({
          customer_full_name: customerName || customerEmail,
          amount,
          transaction_date: transactionDate,
          description,
          transaction_id: transactionId
        });
      }
    }

    revalidatePath('/dashboard/billing');
    return { matched, unmatched };
  } catch (error) {
    console.error('Error uploading settled batch CSV:', error);
    throw new Error('Failed to upload settled batch CSV.');
  }
}

export async function assignPaymentToCustomer(customerId: string, paymentData: UnmatchedPayment) {
  try {
    // Include transaction_id if it exists
    if (paymentData.transaction_id && paymentData.transaction_id.trim()) {
      await sql`
        INSERT INTO payments (transaction_id, customer_id, amount, date, status)
        VALUES (${paymentData.transaction_id}, ${customerId}, ${paymentData.amount}, ${paymentData.transaction_date}, 'submitted')
        ON CONFLICT (transaction_id) DO NOTHING;
      `;
    } else {
      await sql`
        INSERT INTO payments (customer_id, amount, date, status)
        VALUES (${customerId}, ${paymentData.amount}, ${paymentData.transaction_date}, 'submitted')
        ON CONFLICT DO NOTHING;
      `;
    }

    revalidatePath('/dashboard/billing');
  } catch (error) {
    console.error('Error assigning payment:', error);
    throw new Error('Failed to assign payment to customer.');
  }
}

export async function currentDateCheckRecurringInvoices() {
   try {
      // Log current date for debugging
      const currentDateCheck = await sql`SELECT CURRENT_DATE`;
      console.log('Database CURRENT_DATE:', currentDateCheck);
      
      // Fetch all recurring invoices where next_date is today or earlier
      const invoices = await sql<Array<{
        id: string;
        customer_id: string;
        description: string;
        amount: number;
        next_date: Date;
      }>>`
        SELECT id, customer_id, description, amount, next_date, DATE(next_date) as next_date_only
        FROM recurring_invoices
        WHERE DATE(next_date) <= CURRENT_DATE
      `;
  
      
      console.log(`Found ${invoices.length} recurring invoices to process.`);
      console.log('Invoices:', JSON.stringify(invoices, null, 2));
      
      const generated = [];
      const errors = [];
      
      // Generate an invoice for each recurring invoice that's due today
      for (const invoice of invoices) {
        try {
  
          const formData = new FormData();
          formData.append('recurringInvoiceId', invoice.id);
          
          await generateInvoiceFromRecurring(formData);
          
          generated.push({
            id: invoice.id,
            customer_id: invoice.customer_id,
            description: invoice.description,
            amount: invoice.amount
          });
        } catch (error: any) {
          errors.push({
            id: invoice.id,
            error: String(error?.message ?? error)
          });
        }
      }
      
      return ({
        ok: true,
        processed: invoices.length,
        generated: generated.length,
        errors: errors.length,
        details: {
          generated,
          errors
        }
      });
      
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
}

// ==========================================
// USER MANAGEMENT ACTIONS (Admin only)
// ==========================================

const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  user_type: z.enum(['admin', 'user'], { message: 'User type must be either admin or user' }),
});

const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

/**
 * Get all users (admin only)
 */
export async function getAllUsers() {
  try {
    const session = await auth();
    if ((session?.user as any)?.user_type !== 'admin') {
      return { ok: false, error: 'Unauthorized: Admin access required' };
    }

    const users = await sql<Array<{
      id: string;
      name: string;
      email: string;
      user_type: string;
    }>>`
      SELECT id, name, email, user_type 
      FROM users 
      ORDER BY name ASC
    `;

    return { ok: true, users };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Create a new user (admin only, cannot create admin users)
 */
export async function createUser(formData: FormData) {
  try {
    const session = await auth();
    if ((session?.user as any)?.user_type !== 'admin') {
      return { ok: false, error: 'Unauthorized: Admin access required' };
    }

    const validatedFields = CreateUserSchema.safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      user_type: formData.get('user_type'),
    });

    if (!validatedFields.success) {
      return { 
        ok: false, 
        error: validatedFields.error.toString() || 'Invalid input' 
      };
    }

    const { name, email, password, user_type } = validatedFields.data;

    // Prevent creating admin users
    if (user_type === 'admin') {
      return { ok: false, error: 'Cannot create admin users through this interface' };
    }

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return { ok: false, error: 'User with this email already exists' };
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    await sql`
      INSERT INTO users (name, email, password, user_type)
      VALUES (${name}, ${email}, ${hashedPassword}, ${user_type})
    `;

    revalidatePath('/dashboard/admin/users');
    revalidatePath('/dashboard/staff-schedule');
    return { ok: true, message: 'User created successfully' };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Delete a user (admin only, cannot delete admin users)
 */
export async function deleteUser(formData: FormData) {
  try {
    const session = await auth();
    if ((session?.user as any)?.user_type !== 'admin') {
      return { ok: false, error: 'Unauthorized: Admin access required' };
    }

    const userId = formData.get('userId') as string;
    if (!userId) {
      return { ok: false, error: 'User ID is required' };
    }

    // Check if user exists and get their type
    const user = await sql<Array<{ user_type: string }>>`
      SELECT user_type FROM users WHERE id = ${userId}
    `;

    if (user.length === 0) {
      return { ok: false, error: 'User not found' };
    }

    // Prevent deleting admin users
    if (user[0].user_type === 'admin') {
      return { ok: false, error: 'Cannot delete admin users' };
    }

    // Delete the user
    await sql`
      DELETE FROM users WHERE id = ${userId}
    `;

    revalidatePath('/dashboard/admin/users');
    revalidatePath('/dashboard/staff-schedule');
    return { ok: true, message: 'User deleted successfully' };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Update current user's password (any authenticated user)
 */
export async function updatePassword(formData: FormData) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;

    if (!userId) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const validatedFields = UpdatePasswordSchema.safeParse({
      currentPassword: formData.get('currentPassword'),
      newPassword: formData.get('newPassword'),
    });

    if (!validatedFields.success) {
      return { 
        ok: false, 
        error: validatedFields.error.toString() || 'Invalid input' 
      };
    }

    const { currentPassword, newPassword } = validatedFields.data;

    // Get the user's current password hash
    const user = await sql<Array<{ password: string }>>`
      SELECT password FROM users WHERE id = ${userId}
    `;

    if (user.length === 0) {
      return { ok: false, error: 'User not found' };
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user[0].password);
    if (!passwordMatch) {
      return { ok: false, error: 'Current password is incorrect' };
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await sql`
      UPDATE users 
      SET password = ${hashedPassword}
      WHERE id = ${userId}
    `;

    return { ok: true, message: 'Password updated successfully' };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// Camp actions
export async function updateCampSeatAssignment(
  enrolmentId: string,
  seatNumber: number | null,
  date?: Date
) {
  try {
    if (date) {
      if (seatNumber === null) {
        await sql`
          DELETE FROM seat_assignments
          WHERE enrolment_id = ${enrolmentId} AND date = ${date};
        `;
      } else {
        await sql`
          INSERT INTO seat_assignments (enrolment_id, date, seat)
          VALUES (${enrolmentId}, ${date}, ${seatNumber})
          ON CONFLICT (enrolment_id, date) DO UPDATE
          SET seat = EXCLUDED.seat;
        `;
      }
    } else {
      await sql`
        UPDATE camp_enrolments
        SET assigned_seat_number = ${seatNumber}
        WHERE id = ${enrolmentId};
      `;
    }

    revalidateTag('camps', 'max');
    return { ok: true };
  } catch (error) {
    console.error('Error updating seat assignment:', error);
    return { ok: false, error: 'Failed to update seat assignment' };
  }
}

export async function createSlipsForCampers(enrolments: CampEnrolmentWithStudent[]) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;

    if (!userId) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const enrolment_info = await sql<Array<{
      student_id: string;
      student_name: string;
      course: string;
      session: string;
      other_fields: { [key: string]: string } | null;
    }>>`
      SELECT 
        ce.student_id,
        s.name as student_name,
        c.name as course,
        cs.camp_type as session,
        JSONB_STRIP_NULLS(
          JSONB_BUILD_OBJECT(
            'Scratch Login', scr.username,
            'Scratch Password', scr.password,
            'Roblox Login', rob.username,
            'Roblox Password', rob.password,
            'Laptop #', lap.laptop_number
          )
        ) AS other_fields
      FROM camp_enrolments ce
      JOIN students s ON s.id = ce.student_id
      JOIN camp_sessions cs ON cs.id = ce.camp_session_id
      JOIN courses c ON c.id = ce.course_id
      LEFT JOIN scratch_accounts scr ON scr.student_id = s.id
      LEFT JOIN roblox_accounts rob ON rob.student_id = s.id
      LEFT JOIN laptop_assignments lap ON lap.student_id = s.id
      WHERE ce.id = ANY(${enrolments.map(e => e.id)});
    `;
    
    for (const enrolment of enrolment_info) {
      // transform any password labels to generic "Password" before inserting
      let other_fields: { [key: string]: string } | null = null;
      if (enrolment.other_fields && Object.keys(enrolment.other_fields).length > 0) {
        other_fields = {};
        for (const [key, value] of Object.entries(enrolment.other_fields)) {
          if (key === 'Scratch Password' || key === 'Roblox Password') {
            // generic password label; last one wins if both present
            other_fields['Password'] = value;
          } else {
            other_fields[key] = value;
          }
        }
        if (Object.keys(other_fields).length === 0) {
          other_fields = null;
        }
      }

      await sql`
        INSERT INTO slip_info (
          student_name,
          user_id,
          lms_username,
          lms_password,
          course_name,
          other_fields
        )
        VALUES (
          ${enrolment.student_name},
          ${userId},
          ${Number(enrolment.student_id) + '@zebrarobotics.com'},
          '',
          ${enrolment.course + " " + enrolment.session},
          ${other_fields as any}
        );
      `;
    }
    
    revalidateTag('camps', 'max');
    return { ok: true, created: enrolments.length };
  } catch (error) {
    console.error('Error creating slips:', error);
    return { ok: false, error: 'Failed to create slips' };
  }
}

export async function createIncidentReport(prevState: any, formData: FormData) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return { 
      ok: false, 
      error: 'You must be logged in to submit an incident report' 
    };
  }

  // Collect coaches
  const coaches: string[] = [];
  let coachIndex = 0;
  while (formData.has(`coach_${coachIndex}`)) {
    const coach = formData.get(`coach_${coachIndex}`)?.toString().trim();
    if (coach) coaches.push(coach);
    coachIndex++;
  }

  // Collect other students
  const otherStudents: string[] = [];
  let studentIndex = 0;
  while (formData.has(`other_student_${studentIndex}`)) {
    const student = formData.get(`other_student_${studentIndex}`)?.toString().trim();
    if (student) otherStudents.push(student);
    studentIndex++;
  }

  const validatedFields = IncidentReportFormSchema.safeParse({
    incident_date: formData.get('incident_date'),
    incident_time: formData.get('incident_time'),
    student_name: formData.get('student_name'),
    coaches,
    what_happened: formData.get('what_happened'),
    what_led_up: formData.get('what_led_up'),
    other_students: otherStudents.length > 0 ? otherStudents : undefined,
    parent_involvement: formData.get('parent_involvement'),
    how_addressed: formData.get('how_addressed'),
  });

  if (!validatedFields.success) {
    const errors = validatedFields.error.flatten().fieldErrors;
    const firstError = Object.values(errors)[0]?.[0];
    return {
      ok: false,
      error: firstError || 'Invalid form data',
    };
  }

  const data = validatedFields.data;

  try {
    const currentDate = new Date();
    
    // Format the details as JSON
    const details = {
      incident_date: data.incident_date,
      incident_time: data.incident_time,
      student_name: data.student_name,
      coaches: data.coaches,
      what_happened: data.what_happened,
      what_led_up: data.what_led_up,
      other_students: data.other_students || [],
      parent_involvement: data.parent_involvement,
      how_addressed: data.how_addressed,
    };
    
    await sql`
      INSERT INTO incident_reports (details, status, user_id, date)
      VALUES (${JSON.stringify(details)}, 'new', ${session.user.id}, ${currentDate})
    `;

    revalidateTag('incident-reports', 'max');
    return { 
      ok: true, 
      message: 'Incident report submitted successfully' 
    };
  } catch (error) {
    console.error('Error creating incident report:', error);
    return { 
      ok: false, 
      error: 'Failed to submit incident report' 
    };
  }
}

export async function updateIncidentReportStatus(prevState: any, formData: FormData) {
  const session = await auth();
  const userType = (session?.user as any)?.user_type;

  if (userType !== 'admin') {
    return { 
      ok: false, 
      error: 'Only admin users can update incident report status' 
    };
  }

  const reportId = formData.get('reportId') as string;
  const status = formData.get('status') as string;

  if (!reportId || !status) {
    return { ok: false, error: 'Missing required fields' };
  }

  if (!['new', 'in progress', 'closed'].includes(status)) {
    return { ok: false, error: 'Invalid status value' };
  }

  try {
    await sql`
      UPDATE incident_reports
      SET status = ${status}
      WHERE id = ${reportId}
    `;

    revalidatePath('/dashboard/admin/incident-reports');
    return { ok: true, message: 'Status updated successfully' };
  } catch (error) {
    console.error('Error updating incident report status:', error);
    return { ok: false, error: 'Failed to update status' };
  }
}

export async function cancelMakeup(makeupId: string) {
  try {
    await sql`
      UPDATE makeups
      SET cancelled = true
      WHERE id = ${makeupId};
    `;
    revalidatePath("/dashboard/schedule");
    revalidateTag("schedule", "max");
  } catch (error) {
    console.error('error cancelling makeup: ', error);
    throw error;
  }
}

const CreateShiftTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
});

const UpdateTemplateRangeSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

const CreateTemplateShiftSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  weekday: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

const ALLOWED_SHIFT_TYPES = [
  'office',
  'coach',
  'pickup_frankland',
  'pickup_jackman',
] as const;

function parseShiftTypes(formData: FormData): string[] {
  const values = formData
    .getAll('shiftTypes')
    .map((v) => String(v))
    .filter((v) => ALLOWED_SHIFT_TYPES.includes(v as any));
  const deduped = Array.from(new Set(values));
  return deduped.length > 0 ? deduped : ['coach'];
}

const AssignTemplateShiftStaffSchema = z.object({
  templateShiftId: z.coerce.number().int().positive(),
  userId: z.string().min(1),
});

const CreateTemplateShiftWithStaffSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  weekday: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  userId: z.string().min(1),
});

const CreateStaffAbsenceSchema = z.object({
  userId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  status: z.enum(['requested', 'approved']).default('approved'),
  note: z.string().optional(),
});

const UpdateStaffAbsenceSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  status: z.enum(['requested', 'approved']).default('approved'),
  note: z.string().optional(),
});

const CreateUntemplatedShiftSchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

const UpdateUntemplatedShiftSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

const SaveAvailabilitySchema = z.object({
  slotsJson: z.string().min(2),
});

const OwnAbsenceRequestSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  note: z.string().optional(),
});

const UpdateOwnAbsenceRequestSchema = OwnAbsenceRequestSchema.extend({
  id: z.coerce.number().int().positive(),
});

const UpsertStaffQualificationSchema = z.object({
  userId: z.string().min(1),
  courseId: z.string().min(1),
});

const UpdateCoachQualificationsSchema = z.object({
  userId: z.string().min(1),
});

export async function createShiftTemplate(formData: FormData) {
  const parsed = CreateShiftTemplateSchema.safeParse({
    name: formData.get('name'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid template data');
  }

  await sql`
    INSERT INTO shift_template (name)
    VALUES (${parsed.data.name.trim()})
  `;

  revalidatePath('/dashboard/staff-schedule');
}

export async function deleteShiftTemplate(formData: FormData) {
  const templateId = z.coerce.number().int().positive().parse(formData.get('templateId'));

  await sql.begin(async (trx) => {
    await trx`DELETE FROM template_date_range WHERE template_id = ${templateId}`;

    const shiftIds = await trx<Array<{ id: number }>>`
      SELECT id FROM template_shift WHERE template_id = ${templateId}
    `;
    const ids = shiftIds.map((s) => s.id);
    if (ids.length > 0) {
      await trx`DELETE FROM assigned_staff WHERE template_shift_id = ANY(${ids}::int[])`;
    }

    await trx`DELETE FROM template_shift WHERE template_id = ${templateId}`;
    await trx`DELETE FROM shift_template WHERE id = ${templateId}`;
  });

  revalidatePath('/dashboard/staff-schedule');
}

export async function createTemplateDateRange(formData: FormData) {
  const parsed = UpdateTemplateRangeSchema.safeParse({
    templateId: formData.get('templateId'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid range data');
  }

  const { templateId, startDate, endDate } = parsed.data;
  await sql`
    INSERT INTO template_date_range (template_id, start_date, end_date)
    VALUES (${templateId}, ${startDate}::date, ${endDate}::date)
  `;

  revalidatePath('/dashboard/staff-schedule');
}

export async function deleteTemplateDateRange(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  await sql`DELETE FROM template_date_range WHERE id = ${id}`;
  revalidatePath('/dashboard/staff-schedule');
}

export async function createTemplateShift(formData: FormData) {
  const parsed = CreateTemplateShiftSchema.safeParse({
    templateId: formData.get('templateId'),
    weekday: formData.get('weekday'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid shift data');
  }

  const { templateId, weekday, startTime, endTime } = parsed.data;
  const shiftTypes = parseShiftTypes(formData);

  await sql.begin(async (trx) => {
    const inserted = await trx<Array<{ id: number }>>`
      INSERT INTO template_shift (template_id, weekday, start_time, end_time)
      VALUES (${templateId}, ${weekday}, ${startTime}::time, ${endTime}::time)
      RETURNING id
    `;

    const templateShiftId = inserted[0].id;
    await trx`
      INSERT INTO template_shift_type (template_shift_id, shift_type)
      SELECT ${templateShiftId}, shift_type
      FROM UNNEST(${shiftTypes}::text[]) AS t(shift_type)
      ON CONFLICT (template_shift_id, shift_type) DO NOTHING
    `;
  });

  revalidatePath('/dashboard/staff-schedule');
}

export async function createTemplateShiftWithStaff(formData: FormData) {
  const parsed = CreateTemplateShiftWithStaffSchema.safeParse({
    templateId: formData.get('templateId'),
    weekday: formData.get('weekday'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    userId: formData.get('userId'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid shift data');
  }

  const { templateId, weekday, startTime, endTime, userId } = parsed.data;
  const shiftTypes = parseShiftTypes(formData);

  await sql.begin(async (trx) => {
    const inserted = await trx<Array<{ id: number }>>`
      INSERT INTO template_shift (template_id, weekday, start_time, end_time)
      VALUES (${templateId}, ${weekday}, ${startTime}::time, ${endTime}::time)
      RETURNING id
    `;

    const templateShiftId = inserted[0].id;
    await trx`
      INSERT INTO template_shift_type (template_shift_id, shift_type)
      SELECT ${templateShiftId}, shift_type
      FROM UNNEST(${shiftTypes}::text[]) AS t(shift_type)
      ON CONFLICT (template_shift_id, shift_type) DO NOTHING
    `;
    await trx`
      INSERT INTO assigned_staff (template_shift_id, user_id)
      VALUES (${templateShiftId}, ${userId})
      ON CONFLICT (template_shift_id, user_id) DO NOTHING
    `;
  });

  revalidatePath('/dashboard/staff-schedule');
}

export async function updateTemplateShift(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  const parsed = CreateTemplateShiftSchema.safeParse({
    templateId: formData.get('templateId'),
    weekday: formData.get('weekday'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid shift data');
  }

  const { templateId, weekday, startTime, endTime } = parsed.data;
  const shiftTypes = parseShiftTypes(formData);

  await sql.begin(async (trx) => {
    await trx`
      UPDATE template_shift
      SET template_id = ${templateId},
          weekday = ${weekday},
          start_time = ${startTime}::time,
          end_time = ${endTime}::time
      WHERE id = ${id}
    `;

    await trx`DELETE FROM template_shift_type WHERE template_shift_id = ${id}`;
    await trx`
      INSERT INTO template_shift_type (template_shift_id, shift_type)
      SELECT ${id}, shift_type
      FROM UNNEST(${shiftTypes}::text[]) AS t(shift_type)
      ON CONFLICT (template_shift_id, shift_type) DO NOTHING
    `;
  });

  revalidatePath('/dashboard/staff-schedule');
}

export async function deleteTemplateShift(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  await sql.begin(async (trx) => {
    await trx`DELETE FROM template_shift_type WHERE template_shift_id = ${id}`;
    await trx`DELETE FROM assigned_staff WHERE template_shift_id = ${id}`;
    await trx`DELETE FROM template_shift WHERE id = ${id}`;
  });

  revalidatePath('/dashboard/staff-schedule');
}

export async function assignStaffToTemplateShift(formData: FormData) {
  const parsed = AssignTemplateShiftStaffSchema.safeParse({
    templateShiftId: formData.get('templateShiftId'),
    userId: formData.get('userId'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid assignment');
  }

  const { templateShiftId, userId } = parsed.data;
  await sql`
    INSERT INTO assigned_staff (template_shift_id, user_id)
    VALUES (${templateShiftId}, ${userId})
    ON CONFLICT (template_shift_id, user_id) DO NOTHING
  `;

  revalidatePath('/dashboard/staff-schedule');
}

export async function unassignStaffFromTemplateShift(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  await sql`DELETE FROM assigned_staff WHERE id = ${id}`;
  revalidatePath('/dashboard/staff-schedule');
}

export async function createStaffAbsence(formData: FormData) {
  const parsed = CreateStaffAbsenceSchema.safeParse({
    userId: formData.get('userId'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    status: formData.get('status') || 'approved',
    note: formData.get('note') || '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid absence data');
  }

  const { userId, startDate, endDate, startTime, endTime, status, note } = parsed.data;
  await sql`
    INSERT INTO staff_absence (user_id, start_date, end_date, start_time, end_time, status, note)
    VALUES (
      ${userId},
      ${startDate}::date,
      ${endDate}::date,
      ${startTime}::time,
      ${endTime}::time,
      ${status},
      ${note?.trim() ? note.trim() : null}
    )
  `;
  revalidatePath('/dashboard/staff-schedule');
}

export async function updateStaffAbsence(formData: FormData) {
  const parsed = UpdateStaffAbsenceSchema.safeParse({
    id: formData.get('id'),
    userId: formData.get('userId'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    status: formData.get('status') || 'approved',
    note: formData.get('note') || '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid absence data');
  }

  const { id, userId, startDate, endDate, startTime, endTime, status, note } = parsed.data;
  await sql`
    UPDATE staff_absence
    SET user_id = ${userId},
        start_date = ${startDate}::date,
        end_date = ${endDate}::date,
        start_time = ${startTime}::time,
        end_time = ${endTime}::time,
        status = ${status},
        note = ${note?.trim() ? note.trim() : null}
    WHERE id = ${id}
  `;
  revalidatePath('/dashboard/staff-schedule');
}

export async function deleteStaffAbsence(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  await sql`DELETE FROM staff_absence WHERE id = ${id}`;
  revalidatePath('/dashboard/staff-schedule');
}

export async function createUntemplatedShift(formData: FormData) {
  const parsed = CreateUntemplatedShiftSchema.safeParse({
    userId: formData.get('userId'),
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid untemplated shift data');
  }

  const { userId, date, startTime, endTime } = parsed.data;
  const shiftTypes = parseShiftTypes(formData);
  await sql.begin(async (trx) => {
    const inserted = await trx<Array<{ id: number }>>`
      INSERT INTO untemplated_shift (user_id, date, start_time, end_time)
      VALUES (${userId}, ${date}::date, ${startTime}::time, ${endTime}::time)
      RETURNING id
    `;
    const untemplatedShiftId = inserted[0].id;
    await trx`
      INSERT INTO untemplated_shift_type (untemplated_shift_id, shift_type)
      SELECT ${untemplatedShiftId}, shift_type
      FROM UNNEST(${shiftTypes}::text[]) AS t(shift_type)
      ON CONFLICT (untemplated_shift_id, shift_type) DO NOTHING
    `;
  });
  revalidatePath('/dashboard/staff-schedule');
}

export async function updateUntemplatedShift(formData: FormData) {
  const parsed = UpdateUntemplatedShiftSchema.safeParse({
    id: formData.get('id'),
    userId: formData.get('userId'),
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid untemplated shift data');
  }

  const { id, userId, date, startTime, endTime } = parsed.data;
  const shiftTypes = parseShiftTypes(formData);

  await sql.begin(async (trx) => {
    await trx`
      UPDATE untemplated_shift
      SET user_id = ${userId},
          date = ${date}::date,
          start_time = ${startTime}::time,
          end_time = ${endTime}::time
      WHERE id = ${id}
    `;
    await trx`DELETE FROM untemplated_shift_type WHERE untemplated_shift_id = ${id}`;
    await trx`
      INSERT INTO untemplated_shift_type (untemplated_shift_id, shift_type)
      SELECT ${id}, shift_type
      FROM UNNEST(${shiftTypes}::text[]) AS t(shift_type)
      ON CONFLICT (untemplated_shift_id, shift_type) DO NOTHING
    `;
  });

  revalidatePath('/dashboard/staff-schedule');
}

export async function deleteUntemplatedShift(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  await sql.begin(async (trx) => {
    await trx`DELETE FROM untemplated_shift_type WHERE untemplated_shift_id = ${id}`;
    await trx`DELETE FROM untemplated_shift WHERE id = ${id}`;
  });
  revalidatePath('/dashboard/staff-schedule');
}

export async function updateCoachCapacity(formData: FormData) {
  const userId = z.string().min(1).parse(formData.get('userId'));
  const coachCapacity = z.coerce.number().min(0).max(50).parse(formData.get('coachCapacity'));
  await sql`
    UPDATE users
    SET coach_capacity = ${coachCapacity}
    WHERE id::text = ${userId}
  `;
  revalidatePath('/dashboard/staff-schedule');
}

export async function createStaffQualification(formData: FormData) {
  const parsed = UpsertStaffQualificationSchema.safeParse({
    userId: formData.get('userId'),
    courseId: formData.get('courseId'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid qualification data');
  }

  const { userId, courseId } = parsed.data;
  await sql`
    INSERT INTO staff_qualification (user_id, course_id)
    VALUES (${userId}, ${courseId})
    ON CONFLICT (user_id, course_id) DO NOTHING
  `;
  revalidatePath('/dashboard/staff-schedule');
}

export async function deleteStaffQualification(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  await sql`DELETE FROM staff_qualification WHERE id = ${id}`;
  revalidatePath('/dashboard/staff-schedule');
}

export async function updateCoachQualifications(formData: FormData) {
  const parsed = UpdateCoachQualificationsSchema.safeParse({
    userId: formData.get('userId'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid qualification update');
  }

  const { userId } = parsed.data;
  const selectedCourseIds = formData
    .getAll('courseIds')
    .map((v) => String(v))
    .filter((v) => v.length > 0);

  await sql.begin(async (trx) => {
    await trx`DELETE FROM staff_qualification WHERE user_id::text = ${userId}`;
    if (selectedCourseIds.length > 0) {
      await trx`
        INSERT INTO staff_qualification (user_id, course_id)
        SELECT ${userId}, course_id
        FROM UNNEST(${selectedCourseIds}::text[]) AS t(course_id)
        ON CONFLICT (user_id, course_id) DO NOTHING
      `;
    }
  });

  revalidatePath('/dashboard/staff-schedule');
}

export async function saveMyAvailability(formData: FormData) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const parsed = SaveAvailabilitySchema.safeParse({
    slotsJson: formData.get('slotsJson'),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid availability data');
  }

  const rawSlots = JSON.parse(parsed.data.slotsJson) as Array<{ weekday: string; start_time: string }>;
  const validWeekdays = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  const normalized = rawSlots
    .filter((slot) => validWeekdays.has(String(slot.weekday)))
    .map((slot) => ({
      weekday: String(slot.weekday),
      start_time: String(slot.start_time),
    }))
    .sort((a, b) => {
      if (a.weekday !== b.weekday) return a.weekday.localeCompare(b.weekday);
      return a.start_time.localeCompare(b.start_time);
    });

  const groups = new Map<string, string[]>();
  for (const slot of normalized) {
    const arr = groups.get(slot.weekday) || [];
    arr.push(slot.start_time);
    groups.set(slot.weekday, arr);
  }

  const intervals: Array<{ weekday: string; start_time: string; end_time: string }> = [];
  for (const [weekday, starts] of groups.entries()) {
    const sortedStarts = Array.from(new Set(starts)).sort((a, b) => a.localeCompare(b));
    let blockStart = sortedStarts[0];
    let prev = sortedStarts[0];

    const addThirtyMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      const total = h * 60 + m + 30;
      const nextHour = Math.floor(total / 60);
      const nextMinute = total % 60;
      return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}:00`;
    };

    for (let i = 1; i < sortedStarts.length; i += 1) {
      const current = sortedStarts[i];
      if (current !== addThirtyMinutes(prev)) {
        intervals.push({ weekday, start_time: `${blockStart}:00`.slice(0, 8), end_time: addThirtyMinutes(prev) });
        blockStart = current;
      }
      prev = current;
    }

    intervals.push({ weekday, start_time: `${blockStart}:00`.slice(0, 8), end_time: addThirtyMinutes(prev) });
  }

  await sql.begin(async (trx) => {
    await trx`DELETE FROM staff_availability WHERE user_id::text = ${userId}`;
    if (intervals.length > 0) {
      for (const interval of intervals) {
        await trx`
          INSERT INTO staff_availability (user_id, weekday, start_time, end_time)
          VALUES (${userId}, ${interval.weekday}, ${interval.start_time}::time, ${interval.end_time}::time)
        `;
      }
    }
  });

  revalidatePath('/dashboard/my-schedule');
}

export async function createMyAbsenceRequest(formData: FormData) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const parsed = OwnAbsenceRequestSchema.safeParse({
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    note: formData.get('note') || '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid absence request');
  }

  const { startDate, endDate, startTime, endTime, note } = parsed.data;
  await sql`
    INSERT INTO staff_absence (user_id, start_date, end_date, start_time, end_time, status, note)
    VALUES (${userId}, ${startDate}::date, ${endDate}::date, ${startTime}::time, ${endTime}::time, 'requested', ${note?.trim() ? note.trim() : null})
  `;
  revalidatePath('/dashboard/my-schedule');
  revalidatePath('/dashboard/staff-schedule');
}

export async function updateMyAbsenceRequest(formData: FormData) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const parsed = UpdateOwnAbsenceRequestSchema.safeParse({
    id: formData.get('id'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    note: formData.get('note') || '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid absence request');
  }

  const { id, startDate, endDate, startTime, endTime, note } = parsed.data;
  await sql`
    UPDATE staff_absence
    SET start_date = ${startDate}::date,
        end_date = ${endDate}::date,
        start_time = ${startTime}::time,
        end_time = ${endTime}::time,
        note = ${note?.trim() ? note.trim() : null}
    WHERE id = ${id}
      AND user_id::text = ${userId}
      AND status = 'requested'
  `;
  revalidatePath('/dashboard/my-schedule');
  revalidatePath('/dashboard/staff-schedule');
}

export async function deleteMyAbsenceRequest(formData: FormData) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const id = z.coerce.number().int().positive().parse(formData.get('id'));
  await sql`
    DELETE FROM staff_absence
    WHERE id = ${id}
      AND user_id::text = ${userId}
      AND status = 'requested'
  `;
  revalidatePath('/dashboard/my-schedule');
  revalidatePath('/dashboard/staff-schedule');
}

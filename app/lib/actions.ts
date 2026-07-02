'use server';
 
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { revalidatePath, revalidateTag, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import {z} from 'zod';
import { fetchAttendanceReport, fetchCampEnrolments, fetchEnrolmentReportJSON, fetchStudentEnrolments, setEnrolmentInactive, fetchPrograms, fetchCourseBatches, fetchCourseFees, createEnrolment, markStudentAttendance, type AttendanceStatus } from './scraper_helpers';
import { extractCustomerRows, normalizeAbsencesFromAttendance, normalizeCampEnrolments, normalizeEnrolmentRows as normalizeEnrolmentRows } from "@/app/lib/normalize";
import { insertCampEnrolments, syncAbsencesForRange, syncCustomers, syncEmailsFromFamilyView, upsertAbsences, upsertEnrolmentFromNormalized as upsertEnrolmentFromNormalized, upsertSummerEnrolmentWeekFromNormalized } from './insert_from_portal';
import { CampEnrolmentWithStudent, CampLmsCanvasActionType, CampLmsStatus, CampPrepResourceKind, RecurringInvoice, type CampLmsCanvasCourseSearchResult, type CampPrintableStudentListField, type CampPrintLogEntry } from './definitions';
import {
  CanvasCourse,
  CanvasConfigError,
  CanvasUser,
  NormalizedCanvasEnrollment,
  isCanvasTokenConfigured,
  createCanvasClient,
  clearCanvasTokenCache,
  getCanvasTokenSettings,
  saveCanvasApiTokenToDb,
} from './canvas-lms';
import { Pickup } from './definitions';
import { computeNextDate } from './utils';
import { formatDate } from './utils';
import { localMidnightFromISODate } from './utils';

import { ymd } from './utils';
import { endOfScheduleWeek, isSummerScheduleWeek, startOfScheduleWeek, ymdLocal } from './schedule-week';
import bcrypt from 'bcrypt';
import { auth } from '@/auth';
import { userAgent } from 'next/server';
 
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type SessionUserWithRole = {
  id?: string;
  user_type?: string;
};

function getSessionUser(session: unknown) {
  return (session as { user?: SessionUserWithRole } | null | undefined)?.user;
}

function getSessionUserId(session: unknown) {
  return getSessionUser(session)?.id;
}

function getSessionUserType(session: unknown) {
  return getSessionUser(session)?.user_type;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
  revalidateTag('summer-tokens', 'max');

  return { ok: true, rows: normalized.length, customers: customerRes, emails: emailRes, ...res };
}

export async function scrapeSummerEnrolmentWeek(opts?: {
  weekStart?: string;
  branchId?: number;
  activeId?: number;
  day?: string;
}) {
  const weekStart = ymdLocal(startOfScheduleWeek(opts?.weekStart));
  const weekEnd = ymdLocal(endOfScheduleWeek(weekStart));
  const branchId = opts?.branchId ?? Number(process.env.ZEBRA_BRANCH_ID ?? 20);
  const activeId = opts?.activeId ?? Number(process.env.ZEBRA_DATE_RANGE_ACTIVE_ID ?? process.env.ZEBRA_ACTIVE_ID ?? 2);
  const day = opts?.day ?? "All";

  const raw = await fetchEnrolmentReportJSON({
    endpoint: "class-makeup",
    branchId,
    activeId,
    day,
    fromDate: weekStart,
    toDate: weekEnd,
  });

  const normalized = normalizeEnrolmentRows(raw);
  const res = await upsertSummerEnrolmentWeekFromNormalized(normalized, {
    startDate: weekStart,
    endDate: weekEnd,
    day,
  });

  const customerRows = extractCustomerRows(raw);
  const customerRes = await syncCustomers(customerRows);
  const emailRes = await syncEmailsFromFamilyView();

  revalidatePath("/dashboard", 'layout');
  revalidatePath("/students", 'layout');
  revalidateTag('schedule', 'max');
  revalidateTag('summer-tokens', 'max');

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
  revalidatePath("/dashboard/camp", 'layout');
  revalidateTag('camps', 'max');

  return { ok: true, rows: normalized.length, customers: customerRes, ...res };
}


// ── Portal enrolment management (live writes) ─────────────────────────────────
//
// These mutate the live Zebra portal. They are deliberately manual (triggered
// from dashboard buttons), never wired into the automated scrape. See the
// scraper_helpers contract for endpoint details.

// Loader: list a student's current (not yet ended) portal enrolments, for the
// unenrol picker.
export async function listStudentPortalEnrolments(studentId: number) {
  try {
    const enrolments = await fetchStudentEnrolments(studentId);
    const activeEnrolments = enrolments.filter(isCurrentPortalEnrolment);
    return { ok: true as const, enrolments: activeEnrolments };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// Mark one portal enrolment inactive (read-modify-PATCH on student_batch_id).
export async function markPortalEnrolmentInactive(opts: {
  studentId: number;
  studentBatchId: number;
  completionDate?: string; // "YYYY-MM-DD"
}) {
  try {
    await setEnrolmentInactive(opts);
    revalidatePath('/dashboard', 'layout');
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// Loader: full add-enrolment catalogue (programs + levels) for the picker.
export async function listPortalPrograms(branchId?: number) {
  try {
    const programs = await fetchPrograms(branchId);
    return { ok: true as const, programs };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// Loader: scheduled classes + fee options for a chosen course.
export async function listPortalCourseOptions(courseId: number, branchId?: number) {
  try {
    const [batches, fees] = await Promise.all([
      fetchCourseBatches(courseId, branchId),
      fetchCourseFees(courseId, branchId),
    ]);
    return { ok: true as const, batches, fees };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// Create a new portal enrolment.
export async function addPortalEnrolment(opts: {
  studentId: number;
  courseId: number;
  subCourseId: number;
  batchId: number;
  feeId: number;
  price: number;
  startDate: string; // "YYYY-MM-DD"
  recurringPaymentType?: string;
  branchId?: number;
}) {
  try {
    await createEnrolment(opts);
    revalidatePath('/dashboard', 'layout');
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// A portal enrolment counts as "current" when the course is active and at least
// one of its batches has not already ended.
function isCurrentPortalEnrolment(enrolment: Awaited<ReturnType<typeof fetchStudentEnrolments>>[number]): boolean {
  if (enrolment.course_active_id !== 1) return false;
  const now = new Date();
  return (enrolment.batches ?? []).some((batch) => {
    if (!batch.enddate) return true;
    const endDate = new Date(batch.enddate);
    return Number.isFinite(endDate.getTime()) && endDate.getTime() >= now.getTime();
  });
}

function normalizePortalTime(value: string | null | undefined): string {
  return typeof value === 'string' ? value.slice(0, 5) : '';
}

// Picks the student's most recently ended (past) enrolment — used to pre-fill
// the course/level when enrolling them into a summer session.
function mostRecentlyEndedEnrolment(
  enrolments: Awaited<ReturnType<typeof fetchStudentEnrolments>>,
): Awaited<ReturnType<typeof fetchStudentEnrolments>>[number] | null {
  const endedAt = (enrolment: Awaited<ReturnType<typeof fetchStudentEnrolments>>[number]): number => {
    const ends = (enrolment.batches ?? [])
      .map((batch) => (batch.enddate ? new Date(batch.enddate).getTime() : NaN))
      .filter((time) => Number.isFinite(time));
    if (ends.length > 0) return Math.max(...ends);
    return enrolment.enrolled_on ? new Date(enrolment.enrolled_on).getTime() : 0;
  };

  const ended = enrolments.filter((enrolment) => !isCurrentPortalEnrolment(enrolment));
  if (ended.length === 0) return null;
  return [...ended].sort((left, right) => endedAt(right) - endedAt(left))[0];
}

export type SummerEnrolProgramOption = {
  course_id: number;
  name: string;
  course_code: string;
  sub_courses: { sub_course_id: number; code: string; name: string }[];
};

// Loader for the summer "Enrol" control: the portal program catalogue for the
// course/level pickers, plus a course/level suggestion pre-filled from the
// student's most recently ended enrolment (null for brand-new students).
export async function loadSummerEnrolOptions(studentId: number) {
  try {
    const [programs, enrolments] = await Promise.all([
      fetchPrograms(),
      fetchStudentEnrolments(studentId),
    ]);

    const programOptions: SummerEnrolProgramOption[] = programs.map((program) => ({
      course_id: Number(program.id),
      name: program.name,
      course_code: program.course_code,
      sub_courses: (program.subCourses ?? []).map((sub) => ({
        sub_course_id: sub.sub_course_id,
        code: sub.sub_course_code,
        name: sub.sub_course_name,
      })),
    }));

    let suggested: { course_id: number; sub_course_id: number | null } | null = null;
    const reference = mostRecentlyEndedEnrolment(enrolments);
    if (reference) {
      const referenceCourseId = Number(reference.course_id);
      const program = programOptions.find((option) => option.course_id === referenceCourseId);
      if (program) {
        const sub = program.sub_courses.find((candidate) => candidate.code === reference.sub_course_code)
          ?? program.sub_courses[0];
        suggested = { course_id: referenceCourseId, sub_course_id: sub?.sub_course_id ?? null };
      }
    }

    return { ok: true as const, programs: programOptions, suggested };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// Creates a brand-new portal enrolment for a student into the chosen course +
// level, scheduled into the portal batch that matches the selected summer
// session's day + time. Warns and creates nothing when no batch matches.
export async function addPortalEnrolmentForSummerSession(opts: {
  studentId: number;
  sessionId: string;
  startDate: string;
  courseId: number;
  subCourseId: number;
}) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.startDate)) {
      return { ok: false as const, error: 'Start date must be YYYY-MM-DD.' };
    }
    if (!Number.isFinite(opts.courseId) || !Number.isFinite(opts.subCourseId)) {
      return { ok: false as const, error: 'Select a course and level before enrolling.' };
    }

    const sessionRows = await sql<{ weekday: string; start_time: string }[]>`
      SELECT weekday, start_time::text
      FROM sessions
      WHERE id = ${opts.sessionId}::uuid
        AND is_summer = TRUE
      LIMIT 1
    `;
    if (sessionRows.length === 0) {
      return { ok: false as const, error: 'Summer session not found.' };
    }
    const session = sessionRows[0];

    const [batches, fees, portalEnrolments] = await Promise.all([
      fetchCourseBatches(opts.courseId),
      fetchCourseFees(opts.courseId),
      fetchStudentEnrolments(opts.studentId),
    ]);

    const matchingBatch = batches.find((batch) => (
      batch.day.trim().toLowerCase() === session.weekday.trim().toLowerCase()
      && normalizePortalTime(batch.start_time) === normalizePortalTime(session.start_time)
    ));
    if (!matchingBatch) {
      const courseLabel = batches[0]?.course_name ?? `course ${opts.courseId}`;
      return {
        ok: false as const,
        error: `No portal batch matches ${session.weekday} ${normalizePortalTime(session.start_time)} for ${courseLabel}.`,
      };
    }

    // The course's standard "Regular class" fee (fall back to the first fee).
    const fee = fees.find((candidate) => candidate.batch_type_value === 'Regular class') ?? fees[0];
    if (!fee) {
      return { ok: false as const, error: 'No portal fee is configured for the selected course.' };
    }

    const alreadyEnrolled = portalEnrolments.filter(isCurrentPortalEnrolment).some((enrolment) => (
      Number(enrolment.course_id) === opts.courseId
      && (enrolment.batches ?? []).some((batch) => batch.batch_id === matchingBatch.batch_id)
    ));
    if (alreadyEnrolled) {
      return { ok: false as const, error: 'Student is already actively enrolled in this session.' };
    }

    await createEnrolment({
      studentId: opts.studentId,
      courseId: opts.courseId,
      subCourseId: opts.subCourseId,
      batchId: matchingBatch.batch_id,
      feeId: fee.branch_course_fee_id,
      price: Number(fee.course_fee),
      startDate: opts.startDate,
    });

    revalidatePath('/dashboard', 'layout');
    revalidateTag('summer-responses', 'max');
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
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
  const weekStart = formData.get('weekStart')?.toString();

  if (weekStart && isSummerScheduleWeek(weekStart)) {
    await scrapeSummerEnrolmentWeek({ weekStart });
  } else {
    await scrapeEnrolmentNow()
    await syncAbsencesForCurrentWeek()
  }

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
    revalidateAccountPrepViews();
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
    revalidateAccountPrepViews();
  } catch (error) {
    console.error('Error assigning student to roblox account:', error);
    throw new Error('Failed to assign student to roblox account.');
  }
}

export async function assignStudentToLaptop(laptopNumber: string, studentId: string | null) {
  try {
    if (studentId) {
      await sql`
        INSERT INTO laptop_assignments (student_id, laptop_number)
        VALUES (${studentId}, ${laptopNumber})
        ON CONFLICT (student_id) DO UPDATE
        SET laptop_number = EXCLUDED.laptop_number;
      `;
    }
    revalidateAccountPrepViews();
  } catch (error) {
    console.error('Error assigning student to laptop:', error);
    throw new Error('Failed to assign student to laptop.');
  }
}

export async function unassignStudentFromLaptop(laptopNumber: string, studentId: string) {
  try {
    await sql`
      DELETE FROM laptop_assignments
      WHERE laptop_number = ${laptopNumber}
        AND student_id = ${studentId};
    `;
    revalidateAccountPrepViews();
  } catch (error) {
    console.error('Error unassigning student from laptop:', error);
    throw new Error('Failed to unassign student from laptop.');
  }
}

export async function createScratchAccount(username: string, password: string, studentId: string | null = null) {
  try {
    await sql`
      INSERT INTO scratch_accounts (username, password, student_id)
      VALUES (${username}, ${password}, ${studentId});
    `;
    revalidateAccountPrepViews();
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
    revalidateAccountPrepViews();
  } catch (error) {
    console.error('Error creating roblox account:', error);
    throw new Error('Failed to create roblox account.');
  }
}

export async function createLaptopAssignment(laptopNumber: string, studentId: string) {
  try {
    await sql`
      INSERT INTO laptop_assignments (student_id, laptop_number)
      VALUES (${studentId}, ${laptopNumber})
      ON CONFLICT (student_id) DO UPDATE
      SET laptop_number = EXCLUDED.laptop_number;
    `;
    revalidateAccountPrepViews();
  } catch (error) {
    console.error('Error creating laptop assignment:', error);
    throw new Error('Failed to create laptop assignment.');
  }
}

const CampPrepResourceSchema = z.enum(['scratch', 'roblox', 'laptop']);

const CampPrepResourceAssignmentSchema = z.object({
  resourceKind: CampPrepResourceSchema,
  resourceId: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
});

const CampPrepResourceCreateOrAssignSchema = z.object({
  resourceKind: CampPrepResourceSchema,
  identifier: z.string().trim().min(1),
  password: z.string().trim().optional(),
  studentId: z.string().trim().min(1),
});

const PaDayCampAssignmentSchema = z.object({
  campEnrolmentId: z.string().uuid(),
  assignedCourseId: z.string().trim().min(1).nullable(),
});

const CAMP_ACCOUNT_DEFAULT_PASSWORD = 'zebra123';

function revalidateAccountPrepViews() {
  revalidatePath('/dashboard/scratch-accounts');
  revalidatePath('/dashboard/camp');
  revalidatePath('/dashboard/camp/[startDate]/[endDate]', 'page');
  updateTag('camps');
}

export async function assignCampPrepResource(input: {
  resourceKind: CampPrepResourceKind;
  resourceId: string;
  studentId: string;
}) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampPrepResourceAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Choose a valid resource and camper' };
  }

  const { resourceKind, resourceId, studentId } = parsed.data;

  try {
    let updated: { resource_id: string }[] = [];

    if (resourceKind === 'scratch') {
      updated = await sql<{ resource_id: string }[]>`
        UPDATE scratch_accounts
        SET student_id = ${studentId}
        WHERE username = ${resourceId}
          AND (student_id IS NULL OR student_id = ${studentId})
        RETURNING username AS resource_id;
      `;
    } else if (resourceKind === 'roblox') {
      updated = await sql<{ resource_id: string }[]>`
        UPDATE roblox_accounts
        SET student_id = ${studentId}
        WHERE username = ${resourceId}
          AND (student_id IS NULL OR student_id = ${studentId})
        RETURNING username AS resource_id;
      `;
    } else {
      updated = await sql<{ resource_id: string }[]>`
        INSERT INTO laptop_assignments (student_id, laptop_number)
        VALUES (${studentId}, ${resourceId})
        ON CONFLICT (student_id) DO UPDATE
        SET laptop_number = EXCLUDED.laptop_number
        RETURNING laptop_number AS resource_id;
      `;
    }

    if (updated.length === 0) {
      return { ok: false, error: 'That resource is no longer available' };
    }

    revalidateAccountPrepViews();
    return { ok: true };
  } catch (error) {
    console.error('Error assigning camp prep resource:', error);
    return { ok: false, error: 'Failed to assign camp prep resource' };
  }
}

export async function createOrAssignCampPrepResource(input: {
  resourceKind: CampPrepResourceKind;
  identifier: string;
  password?: string;
  studentId: string;
}) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampPrepResourceCreateOrAssignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid resource and camper' };
  }

  const { resourceKind, identifier, studentId } = parsed.data;
  const password = parsed.data.password?.trim() || CAMP_ACCOUNT_DEFAULT_PASSWORD;

  try {
    if (resourceKind === 'scratch') {
      const existing = await sql<{
        resource_id: string;
        student_id: string | null;
        student_name: string | null;
      }[]>`
        SELECT scr.username AS resource_id, scr.student_id, s.name AS student_name
        FROM scratch_accounts scr
        LEFT JOIN students s ON s.id = scr.student_id
        WHERE scr.username = ${identifier}
        LIMIT 1;
      `;

      if (existing.length > 0) {
        const current = existing[0];
        if (current.student_id && String(current.student_id) !== studentId) {
          return {
            ok: false,
            error: `Scratch account ${identifier} is already assigned to ${current.student_name ?? `student ${current.student_id}`}`,
          };
        }

        if (!current.student_id) {
          const updated = await sql<{ resource_id: string }[]>`
            UPDATE scratch_accounts
            SET student_id = ${studentId}
            WHERE username = ${identifier}
              AND student_id IS NULL
            RETURNING username AS resource_id;
          `;

          if (updated.length === 0) {
            return { ok: false, error: 'That Scratch account is no longer available' };
          }
        }
      } else {
        await sql`
          INSERT INTO scratch_accounts (username, password, student_id)
          VALUES (${identifier}, ${password}, ${studentId});
        `;
      }
    } else if (resourceKind === 'roblox') {
      const existing = await sql<{
        resource_id: string;
        student_id: string | null;
        student_name: string | null;
      }[]>`
        SELECT rob.username AS resource_id, rob.student_id, s.name AS student_name
        FROM roblox_accounts rob
        LEFT JOIN students s ON s.id = rob.student_id
        WHERE rob.username = ${identifier}
        LIMIT 1;
      `;

      if (existing.length > 0) {
        const current = existing[0];
        if (current.student_id && String(current.student_id) !== studentId) {
          return {
            ok: false,
            error: `Roblox account ${identifier} is already assigned to ${current.student_name ?? `student ${current.student_id}`}`,
          };
        }

        if (!current.student_id) {
          const updated = await sql<{ resource_id: string }[]>`
            UPDATE roblox_accounts
            SET student_id = ${studentId}
            WHERE username = ${identifier}
              AND student_id IS NULL
            RETURNING username AS resource_id;
          `;

          if (updated.length === 0) {
            return { ok: false, error: 'That Roblox account is no longer available' };
          }
        }
      } else {
        await sql`
          INSERT INTO roblox_accounts (username, password, student_id)
          VALUES (${identifier}, ${password}, ${studentId});
        `;
      }
    } else {
      await sql`
        INSERT INTO laptop_assignments (student_id, laptop_number)
        VALUES (${studentId}, ${identifier})
        ON CONFLICT (student_id) DO UPDATE
        SET laptop_number = EXCLUDED.laptop_number;
      `;
    }

    revalidateAccountPrepViews();
    return { ok: true };
  } catch (error) {
    console.error('Error creating or assigning camp prep resource:', error);
    return { ok: false, error: 'Failed to save camp prep resource' };
  }
}

export async function unassignCampPrepResource(input: {
  resourceKind: CampPrepResourceKind;
  resourceId: string;
  studentId: string;
}) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampPrepResourceAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Choose a valid resource and camper' };
  }

  const { resourceKind, resourceId, studentId } = parsed.data;

  try {
    let updated: { resource_id: string }[] = [];

    if (resourceKind === 'scratch') {
      updated = await sql<{ resource_id: string }[]>`
        UPDATE scratch_accounts
        SET student_id = NULL
        WHERE username = ${resourceId}
          AND student_id = ${studentId}
        RETURNING username AS resource_id;
      `;
    } else if (resourceKind === 'roblox') {
      updated = await sql<{ resource_id: string }[]>`
        UPDATE roblox_accounts
        SET student_id = NULL
        WHERE username = ${resourceId}
          AND student_id = ${studentId}
        RETURNING username AS resource_id;
      `;
    } else {
      updated = await sql<{ resource_id: string }[]>`
        DELETE FROM laptop_assignments
        WHERE laptop_number = ${resourceId}
          AND student_id = ${studentId}
        RETURNING laptop_number AS resource_id;
      `;
    }

    if (updated.length === 0) {
      return { ok: false, error: 'That resource is not assigned to this camper' };
    }

    revalidateAccountPrepViews();
    return { ok: true };
  } catch (error) {
    console.error('Error unassigning camp prep resource:', error);
    return { ok: false, error: 'Failed to unassign camp prep resource' };
  }
}

export async function updatePaDayCampAssignment(input: {
  campEnrolmentId: string;
  assignedCourseId: string | null;
}) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = PaDayCampAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Choose a valid PA Day enrolment and camp' };
  }

  const { campEnrolmentId, assignedCourseId } = parsed.data;

  try {
    const enrolmentRows = await sql<Array<{ is_pa_day_camp: boolean }>>`
      SELECT (
        LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
      ) AS is_pa_day_camp
      FROM camp_enrolments ce
      LEFT JOIN courses c ON c.id = ce.course_id
      WHERE ce.id = ${campEnrolmentId}
      LIMIT 1;
    `;

    if (enrolmentRows.length === 0) {
      return { ok: false, error: 'Camp enrolment was not found' };
    }

    if (!enrolmentRows[0].is_pa_day_camp) {
      return { ok: false, error: 'Camp assignments are only available for PA Day Camp enrolments' };
    }

    if (!assignedCourseId) {
      await sql`
        DELETE FROM camp_pa_day_course_assignments
        WHERE camp_enrolment_id = ${campEnrolmentId};
      `;

      revalidateAccountPrepViews();
      return { ok: true };
    }

    const courseRows = await sql<Array<{ is_pa_day_camp: boolean }>>`
      SELECT (
        LOWER(CONCAT_WS(' ', option_course.id, option_course.label)) LIKE '%day camp%'
      ) AS is_pa_day_camp
      FROM (
        SELECT c.id::text AS id, c.name AS label
        FROM courses c
        WHERE c.id::text = ${assignedCourseId}
        UNION
        SELECT m.course_id AS id, m.lms_course_name AS label
        FROM camp_lms_course_mappings m
        WHERE m.course_id = ${assignedCourseId}
      ) option_course
      LIMIT 1;
    `;

    if (courseRows.length === 0) {
      return { ok: false, error: 'Assigned camp course was not found' };
    }

    if (courseRows[0].is_pa_day_camp) {
      return { ok: false, error: 'Choose the actual camp, not PA Day Camp' };
    }

    await sql`
      INSERT INTO camp_pa_day_course_assignments (camp_enrolment_id, assigned_course_id)
      VALUES (${campEnrolmentId}, ${assignedCourseId})
      ON CONFLICT (camp_enrolment_id) DO UPDATE
      SET assigned_course_id = EXCLUDED.assigned_course_id,
          updated_at = NOW();
    `;

    revalidateAccountPrepViews();
    return { ok: true };
  } catch (error) {
    console.error('Error updating PA Day camp assignment:', error);
    return { ok: false, error: 'Failed to save PA Day camp assignment' };
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
      
      for (const char of lines[i]) {
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
      const row: Record<string, string> = {};
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
              WHERE LOWER(TRIM(COALESCE(email, ''))) = LOWER(TRIM(${paymentData.email.trim()}))
                 OR LOWER(TRIM(COALESCE(alternate_email, ''))) = LOWER(TRIM(${paymentData.email.trim()}))
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

      // Try to match customer by primary or alternate email (case-insensitive)
      const customers = await sql<{ id: string; name: string; email: string }[]>`
        SELECT id, name, email
        FROM customers 
        WHERE LOWER(TRIM(COALESCE(email, ''))) = LOWER(TRIM(${customerEmail}))
           OR LOWER(TRIM(COALESCE(alternate_email, ''))) = LOWER(TRIM(${customerEmail}))
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
        } catch (error: unknown) {
          errors.push({
            id: invoice.id,
            error: errorMessage(error)
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
      
    } catch (e: unknown) {
      return { ok: false, error: errorMessage(e) }
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
    if (getSessionUserType(session) !== 'admin') {
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
  } catch (e: unknown) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Create a new user (admin only, cannot create admin users)
 */
export async function createUser(formData: FormData) {
  try {
    const session = await auth();
    if (getSessionUserType(session) !== 'admin') {
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
  } catch (e: unknown) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Delete a user (admin only, cannot delete admin users)
 */
export async function deleteUser(formData: FormData) {
  try {
    const session = await auth();
    if (getSessionUserType(session) !== 'admin') {
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
  } catch (e: unknown) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Update current user's password (any authenticated user)
 */
export async function updatePassword(formData: FormData) {
  try {
    const session = await auth();
    const userId = getSessionUserId(session);

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
  } catch (e: unknown) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function fetchCanvasApiSettings() {
  try {
    const session = await auth();
    if (getSessionUserType(session) !== 'admin') {
      return { ok: false, error: 'Unauthorized: Admin access required' };
    }

    const settings = await getCanvasTokenSettings();
    return { ok: true, settings };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function saveCanvasApiToken(formData: FormData) {
  try {
    const session = await auth();
    if (getSessionUserType(session) !== 'admin') {
      return { ok: false, error: 'Unauthorized: Admin access required' };
    }

    const rawToken = formData.get('canvasApiToken');
    const intent = formData.get('intent');
    const shouldClear = intent === 'clear';
    const token = typeof rawToken === 'string' && !shouldClear ? rawToken.trim() : null;

    if (!shouldClear && token && token.length > 0) {
      await saveCanvasApiTokenToDb(token);
    } else {
      await saveCanvasApiTokenToDb(null);
    }

    clearCanvasTokenCache();
    revalidatePath('/dashboard/settings');

    const settings = await getCanvasTokenSettings();
    const isCleared = shouldClear || !token;
    return {
      ok: true,
      settings,
      message: isCleared
        ? 'Canvas API token entry removed from dashboard settings.'
        : 'Canvas API token saved to dashboard settings.',
    };
  } catch (error) {
    const pgError = error as { code?: string } | undefined;
    if (pgError?.code === '42P01') {
      return { ok: false, error: 'Apply migration 033_create_app_settings.sql before saving the Canvas API token setting.' };
    }

    return { ok: false, error: errorMessage(error) };
  }
}

// Camp actions
function toLocalDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    throw new Error('Invalid seat assignment date string');
  }

  if (Number.isNaN(value.getTime())) {
    throw new Error('Invalid seat assignment date');
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type PostgresJsonValue = Parameters<typeof sql.json>[0];

type CampLmsSyncRow = {
  camp_enrolment_id: string;
  student_id: string;
  student_name: string;
  suggested_lms_login: string;
};

type CampLmsCanvasSyncState = {
  canvas_user_id: string | null;
  canvas_user_name: string | null;
  canvas_user_login: string | null;
  canvas_user_email: string | null;
  canvas_user_found: boolean | null;
  canvas_user_matches: unknown;
  active_enrollments: unknown;
  inactive_enrollments: unknown;
  invited_enrollments: unknown;
  sync_status: string | null;
  sync_error: string | null;
  synced_at: Date | null;
};

type CampLmsCanvasActionRow = {
  camp_enrolment_id: string;
  student_id: string;
  student_name: string;
  canvas_user_id: string | null;
  canvas_user_found: boolean | null;
  canvas_user_matches: unknown;
  canvas_sync_status: string | null;
  canvas_beginner_course_id: string | null;
  canvas_intermediate_course_id: string | null;
  canvas_advanced_course_id: string | null;
  canvas_additional_course_ids: unknown;
  active_enrollments: unknown;
  inactive_enrollments: unknown;
  invited_enrollments: unknown;
};

const optionalTrimmedString = z.string().trim().optional();

const CampLmsDateSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const CampPrintableStudentListFieldSchema = z.enum([
  'student',
  'birthday',
  'parent',
  'type',
  'camp',
  'days',
  'room',
  'medical',
  'notes',
] satisfies [CampPrintableStudentListField, ...CampPrintableStudentListField[]]);

const CampPrintableStudentListOverrideSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studentId: z.string().trim().regex(/^\d+(?:\.0+)?$/),
  field: CampPrintableStudentListFieldSchema,
  value: z.string().max(5000),
});

const CampLmsCourseMappingSchema = z.object({
  courseId: z.string().trim().min(1),
  lmsCourseName: optionalTrimmedString,
  lmsCourseLink: optionalTrimmedString,
  notes: optionalTrimmedString,
  canvasBeginnerCourseId: optionalTrimmedString,
  canvasBeginnerCourseName: optionalTrimmedString,
  canvasIntermediateCourseId: optionalTrimmedString,
  canvasIntermediateCourseName: optionalTrimmedString,
  canvasAdvancedCourseId: optionalTrimmedString,
  canvasAdvancedCourseName: optionalTrimmedString,
  canvasAdditionalCourseIds: optionalTrimmedString,
}).refine((input) => Boolean(
  input.lmsCourseName
  || input.canvasBeginnerCourseId
  || input.canvasIntermediateCourseId
  || input.canvasAdvancedCourseId
  || input.canvasAdditionalCourseIds
), {
  message: 'Add a camp name or Canvas course ID before saving',
});

function parseCanvasCourseIdList(value: string | null | undefined) {
  if (!value) return [];
  return Array.from(new Set(
    value
      .split(/[\s,;|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

const CampLmsImportMappingsSchema = z.object({
  tableText: z.string().trim().min(1),
});

const CampLmsCanvasActionSchema = z.object({
  campEnrolmentId: z.string().uuid(),
  type: z.enum(['add_expected_beginner', 'activate_course', 'inactivate_enrollment', 'create_user']),
  canvasCourseId: optionalTrimmedString,
  canvasEnrollmentId: optionalTrimmedString,
});

const CampLmsCanvasCourseSearchSchema = z.object({
  term: z.string().trim().min(2).max(120),
});

const CampLmsStatusSchema = z.enum([
  'verified',
  'missing_user',
  'missing_course',
  'needs_followup',
  'not_applicable',
]);

const CampLmsStatusUpdateSchema = z.object({
  enrolmentId: z.string().uuid(),
  status: CampLmsStatusSchema.nullable(),
  note: z.string().trim().optional(),
});

async function campLmsChecklistSchemaReady() {
  const [schema] = await sql<{ ready: boolean }[]>`
    SELECT (
      to_regclass('public.camp_lms_course_mappings') IS NOT NULL
      AND to_regclass('public.camp_lms_status_checks') IS NOT NULL
      AND to_regclass('public.camp_lms_canvas_sync_state') IS NOT NULL
      AND to_regclass('public.camp_lms_canvas_action_audit') IS NOT NULL
      AND to_regclass('public.camp_pa_day_course_assignments') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'camp_lms_status_checks'
          AND column_name = 'lms_note'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'camp_lms_course_mappings'
          AND column_name = 'canvas_beginner_course_id'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'camp_lms_course_mappings'
          AND column_name = 'canvas_additional_course_ids'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'camp_lms_canvas_action_audit'
          AND column_name = 'after_state'
      )
      AND EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'camp_lms_canvas_action_audit'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%create_user%'
      )
    ) AS ready;
  `;

  return Boolean(schema?.ready);
}

async function campPrintStudentListOverridesReady() {
  const [schema] = await sql<{ ready: boolean }[]>`
    SELECT to_regclass('public.camp_print_student_list_overrides') IS NOT NULL AS ready;
  `;

  return Boolean(schema?.ready);
}

async function campEnrolmentNoteColumnExists() {
  const [column] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'camp_enrolments'
        AND column_name = 'note'
    ) AS exists;
  `;

  return Boolean(column?.exists);
}

function normalizeCanvasLookupValue(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function canvasUserSummary(user: CanvasUser) {
  return {
    id: String(user.id),
    name: user.name ?? null,
    login_id: user.login_id ?? null,
    email: user.email ?? null,
    sis_user_id: user.sis_user_id ?? null,
  };
}

function canvasCourseSummary(course: CanvasCourse): CampLmsCanvasCourseSearchResult {
  return {
    id: String(course.id),
    name: course.name ?? null,
    course_code: course.course_code ?? null,
    workflow_state: course.workflow_state ?? null,
  };
}

function dedupeCanvasUsers(users: CanvasUser[]) {
  const seen = new Set<string>();
  const deduped: CanvasUser[] = [];

  users.forEach((user) => {
    const id = String(user.id);
    if (seen.has(id)) return;
    seen.add(id);
    deduped.push(user);
  });

  return deduped;
}

function findBestCanvasUser(users: CanvasUser[], row: CampLmsSyncRow) {
  const login = normalizeCanvasLookupValue(row.suggested_lms_login);
  const studentId = normalizeCanvasLookupValue(row.student_id);
  const studentName = normalizeCanvasLookupValue(row.student_name);

  const exact = users.find((user) => {
    const loginId = normalizeCanvasLookupValue(user.login_id);
    const email = normalizeCanvasLookupValue(user.email);
    const sisUserId = normalizeCanvasLookupValue(user.sis_user_id);

    return loginId === login
      || email === login
      || sisUserId === studentId
      || loginId === studentId
      || loginId.split('@')[0] === studentId;
  });
  if (exact) return exact;

  const exactNameMatches = users.filter((user) => normalizeCanvasLookupValue(user.name) === studentName);
  return exactNameMatches.length === 1 ? exactNameMatches[0] : null;
}

function splitCanvasEnrollments(enrollments: NormalizedCanvasEnrollment[]) {
  return {
    active: enrollments.filter((enrollment) => enrollment.state === 'active'),
    inactive: enrollments.filter((enrollment) => enrollment.state === 'inactive'),
    invited: enrollments.filter((enrollment) => enrollment.state === 'invited'),
  };
}

function canvasErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchCampLmsSyncRows(startDate: string, endDate: string) {
  return sql<CampLmsSyncRow[]>`
    SELECT
      ce.id::text AS camp_enrolment_id,
      TRUNC(ce.student_id)::text AS student_id,
      s.name AS student_name,
      TRUNC(ce.student_id)::text || '@zebrarobotics.com' AS suggested_lms_login
    FROM camp_sessions cs
    JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
    JOIN students s ON s.id = ce.student_id
    WHERE DATE_TRUNC('week', cs.start_date)::date = ${startDate}::date
      AND cs.start_date <= ${endDate}::date
      AND cs.end_date >= ${startDate}::date
    ORDER BY ce.course_id NULLS LAST, s.name ASC, cs.camp_type ASC;
  `;
}

async function fetchSingleCampLmsSyncRow(campEnrolmentId: string) {
  const [row] = await sql<CampLmsSyncRow[]>`
    SELECT
      ce.id::text AS camp_enrolment_id,
      TRUNC(ce.student_id)::text AS student_id,
      s.name AS student_name,
      TRUNC(ce.student_id)::text || '@zebrarobotics.com' AS suggested_lms_login
    FROM camp_enrolments ce
    JOIN students s ON s.id = ce.student_id
    WHERE ce.id = ${campEnrolmentId}::uuid;
  `;

  return row ?? null;
}

async function saveCampLmsCanvasError(row: CampLmsSyncRow, error: unknown) {
  await sql`
    INSERT INTO camp_lms_canvas_sync_state (
      camp_enrolment_id,
      sync_status,
      sync_error,
      updated_at
    )
    VALUES (
      ${row.camp_enrolment_id}::uuid,
      'error',
      ${canvasErrorMessage(error)},
      NOW()
    )
    ON CONFLICT (camp_enrolment_id) DO UPDATE
    SET sync_status = 'error',
        sync_error = EXCLUDED.sync_error,
        updated_at = NOW();
  `;
}

async function syncCampLmsCanvasState(row: CampLmsSyncRow, client = createCanvasClient()) {
  try {
    const loginMatches = await client.searchUsers(row.suggested_lms_login);
    const nameMatches = await client.searchUsers(row.student_name);
    const users = dedupeCanvasUsers([...loginMatches, ...nameMatches]);
    const selectedUser = findBestCanvasUser(users, row);
    const matches = users.slice(0, 8).map(canvasUserSummary);

    if (!selectedUser) {
      await sql`
        INSERT INTO camp_lms_canvas_sync_state (
          camp_enrolment_id,
          canvas_user_found,
          canvas_user_matches,
          active_enrollments,
          inactive_enrollments,
          invited_enrollments,
          sync_status,
          sync_error,
          synced_at,
          updated_at
        )
        VALUES (
          ${row.camp_enrolment_id}::uuid,
          FALSE,
          ${sql.json(matches as PostgresJsonValue)}::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          'synced',
          NULL,
          NOW(),
          NOW()
        )
        ON CONFLICT (camp_enrolment_id) DO UPDATE
        SET canvas_user_id = NULL,
            canvas_user_name = NULL,
            canvas_user_login = NULL,
            canvas_user_email = NULL,
            canvas_user_found = FALSE,
            canvas_user_matches = EXCLUDED.canvas_user_matches,
            active_enrollments = '[]'::jsonb,
            inactive_enrollments = '[]'::jsonb,
            invited_enrollments = '[]'::jsonb,
            sync_status = 'synced',
            sync_error = NULL,
            synced_at = NOW(),
            updated_at = NOW();
      `;
      return { ok: true, userFound: false };
    }

    const rawEnrollments = await client.getUserEnrollments(String(selectedUser.id));
    const enriched = await client.enrichEnrollments(rawEnrollments);
    const grouped = splitCanvasEnrollments(enriched);

    await sql`
      INSERT INTO camp_lms_canvas_sync_state (
        camp_enrolment_id,
        canvas_user_id,
        canvas_user_name,
        canvas_user_login,
        canvas_user_email,
        canvas_user_found,
        canvas_user_matches,
        active_enrollments,
        inactive_enrollments,
        invited_enrollments,
        sync_status,
        sync_error,
        synced_at,
        updated_at
      )
      VALUES (
        ${row.camp_enrolment_id}::uuid,
        ${String(selectedUser.id)},
        ${selectedUser.name ?? null},
        ${selectedUser.login_id ?? null},
        ${selectedUser.email ?? null},
        TRUE,
        ${sql.json(matches as PostgresJsonValue)}::jsonb,
        ${sql.json(grouped.active as PostgresJsonValue)}::jsonb,
        ${sql.json(grouped.inactive as PostgresJsonValue)}::jsonb,
        ${sql.json(grouped.invited as PostgresJsonValue)}::jsonb,
        'synced',
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (camp_enrolment_id) DO UPDATE
      SET canvas_user_id = EXCLUDED.canvas_user_id,
          canvas_user_name = EXCLUDED.canvas_user_name,
          canvas_user_login = EXCLUDED.canvas_user_login,
          canvas_user_email = EXCLUDED.canvas_user_email,
          canvas_user_found = TRUE,
          canvas_user_matches = EXCLUDED.canvas_user_matches,
          active_enrollments = EXCLUDED.active_enrollments,
          inactive_enrollments = EXCLUDED.inactive_enrollments,
          invited_enrollments = EXCLUDED.invited_enrollments,
          sync_status = 'synced',
          sync_error = NULL,
          synced_at = NOW(),
          updated_at = NOW();
    `;

    return { ok: true, userFound: true };
  } catch (error) {
    await saveCampLmsCanvasError(row, error);
    return { ok: false, error: canvasErrorMessage(error) };
  }
}

async function fetchCampLmsCanvasSyncState(campEnrolmentId: string) {
  const [state] = await sql<CampLmsCanvasSyncState[]>`
    SELECT
      canvas_user_id,
      canvas_user_name,
      canvas_user_login,
      canvas_user_email,
      canvas_user_found,
      canvas_user_matches,
      active_enrollments,
      inactive_enrollments,
      invited_enrollments,
      sync_status,
      sync_error,
      synced_at
    FROM camp_lms_canvas_sync_state
    WHERE camp_enrolment_id = ${campEnrolmentId}::uuid;
  `;

  return state ?? null;
}

async function fetchCampLmsCanvasActionRow(campEnrolmentId: string) {
  const [row] = await sql<CampLmsCanvasActionRow[]>`
    SELECT
      ce.id::text AS camp_enrolment_id,
      TRUNC(ce.student_id)::text AS student_id,
      s.name AS student_name,
      sync.canvas_user_id,
      sync.canvas_user_found,
      COALESCE(sync.canvas_user_matches, '[]'::jsonb) AS canvas_user_matches,
      sync.sync_status AS canvas_sync_status,
      m.canvas_beginner_course_id,
      m.canvas_intermediate_course_id,
      m.canvas_advanced_course_id,
      m.canvas_additional_course_ids,
      COALESCE(sync.active_enrollments, '[]'::jsonb) AS active_enrollments,
      COALESCE(sync.inactive_enrollments, '[]'::jsonb) AS inactive_enrollments,
      COALESCE(sync.invited_enrollments, '[]'::jsonb) AS invited_enrollments
    FROM camp_enrolments ce
    JOIN students s ON s.id = ce.student_id
    LEFT JOIN courses c ON c.id = ce.course_id
    LEFT JOIN camp_pa_day_course_assignments pa_day ON pa_day.camp_enrolment_id = ce.id
    LEFT JOIN courses assigned_course ON assigned_course.id::text = pa_day.assigned_course_id
    LEFT JOIN camp_lms_course_mappings assigned_mapping ON assigned_mapping.course_id = pa_day.assigned_course_id
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
          AND pa_day.assigned_course_id IS NOT NULL
        THEN pa_day.assigned_course_id
        ELSE ce.course_id::text
      END AS course_id
    ) effective ON TRUE
    LEFT JOIN camp_lms_course_mappings m ON m.course_id = effective.course_id
    LEFT JOIN camp_lms_canvas_sync_state sync ON sync.camp_enrolment_id = ce.id
    WHERE ce.id = ${campEnrolmentId}::uuid;
  `;

  return row ?? null;
}

function splitMappingLine(line: string) {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  if (line.includes('|')) return line.split('|').map((cell) => cell.trim()).filter(Boolean);
  return line.split(',').map((cell) => cell.trim());
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function columnIndex(headers: string[], patterns: string[]) {
  return headers.findIndex((header) => patterns.some((pattern) => header.includes(pattern)));
}

function extractCanvasCourseId(value: string | undefined) {
  if (!value) return null;
  const urlMatch = value.match(/\/courses\/(\d+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const numberMatches = value.match(/\b\d+\b/g);
  return numberMatches?.at(-1) ?? null;
}

function extractCourseName(value: string | undefined, courseId: string | null) {
  if (!value || !courseId) return null;
  const withoutUrl = value.replace(/https?:\/\/\S+/g, '').trim();
  const withoutId = withoutUrl
    .replace(new RegExp(`\\(?\\b${courseId}\\b\\)?`, 'g'), '')
    .replace(/\s+-\s+$/, '')
    .trim();

  return withoutId.length > 0 ? withoutId : null;
}

async function revalidateCampLmsPaths(startDate?: string, endDate?: string) {
  revalidatePath('/dashboard/camp');
  revalidatePath('/dashboard/camp/lms-mappings');
  updateTag('camps');
  if (startDate && endDate) {
    revalidatePath(`/dashboard/camp/${startDate}/${endDate}`);
  }
}

export async function refreshCampLmsWeek(startDate: string, endDate: string) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampLmsDateSchema.safeParse({ startDate, endDate });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid camp week dates' };
  }

  try {
    const branchId = Number(process.env.ZEBRA_BRANCH_ID ?? 20);
    const raw = await fetchCampEnrolments({
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      branchId,
    });
    const normalized = normalizeCampEnrolments(raw);
    const result = await insertCampEnrolments(normalized, parsed.data);

    revalidateTag('camps', 'max');
    await revalidateCampLmsPaths(parsed.data.startDate, parsed.data.endDate);

    return { ok: true, result };
  } catch (error) {
    console.error('Error refreshing camp LMS week:', error);
    return { ok: false, error: 'Failed to refresh portal camp roster' };
  }
}

export async function syncCampLmsCanvasWeek(startDate: string, endDate: string) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampLmsDateSchema.safeParse({ startDate, endDate });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid camp week dates' };
  }

  try {
    if (!(await campLmsChecklistSchemaReady())) {
      return { ok: false, error: 'Apply migrations 025_lms_camp_checklist.sql, 026_canvas_lms_workflow.sql, 027_rename_lms_status_note.sql, 030_lms_canvas_activate_course_action.sql, 032_lms_mapping_additional_courses.sql, 038_lms_canvas_create_user_action.sql, 039_rename_lms_canvas_sync_state.sql, and 040_pa_day_camp_course_assignments.sql before syncing Canvas' };
    }
    if (!(await isCanvasTokenConfigured())) {
      return { ok: false, error: 'CANVAS_API_TOKEN is not configured for server-side Canvas sync' };
    }

    const client = createCanvasClient();
    const rows = await fetchCampLmsSyncRows(parsed.data.startDate, parsed.data.endDate);
    let synced = 0;
    const errors: Array<{ enrolmentId: string; studentName: string; error: string }> = [];

    for (const row of rows) {
      const result = await syncCampLmsCanvasState(row, client);
      if (result.ok) {
        synced += 1;
      } else {
        errors.push({
          enrolmentId: row.camp_enrolment_id,
          studentName: row.student_name,
          error: result.error ?? 'Canvas sync failed',
        });
      }
    }

    await revalidateCampLmsPaths(parsed.data.startDate, parsed.data.endDate);
    return { ok: true, synced, errors };
  } catch (error) {
    if (error instanceof CanvasConfigError) {
      return { ok: false, error: 'CANVAS_API_TOKEN is not configured for server-side Canvas sync' };
    }
    console.error('Error syncing camp LMS Canvas state:', error);
    return { ok: false, error: 'Failed to sync Canvas LMS state' };
  }
}

export async function saveCampLmsCourseMapping(input: {
  courseId: string;
  lmsCourseName?: string;
  lmsCourseLink?: string;
  notes?: string;
  canvasBeginnerCourseId?: string;
  canvasBeginnerCourseName?: string;
  canvasIntermediateCourseId?: string;
  canvasIntermediateCourseName?: string;
  canvasAdvancedCourseId?: string;
  canvasAdvancedCourseName?: string;
  canvasAdditionalCourseIds?: string;
}) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampLmsCourseMappingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Add a Canvas mapping before saving' };
  }

  const {
    courseId,
    lmsCourseName,
    lmsCourseLink,
    notes,
    canvasBeginnerCourseId,
    canvasBeginnerCourseName,
    canvasIntermediateCourseId,
    canvasIntermediateCourseName,
    canvasAdvancedCourseId,
    canvasAdvancedCourseName,
    canvasAdditionalCourseIds,
  } = parsed.data;
  const storedCourseName = lmsCourseName || courseId;
  const additionalIds = parseCanvasCourseIdList(canvasAdditionalCourseIds);

  try {
    if (!(await campLmsChecklistSchemaReady())) {
      return { ok: false, error: 'Apply migrations 025_lms_camp_checklist.sql, 026_canvas_lms_workflow.sql, 027_rename_lms_status_note.sql, 030_lms_canvas_activate_course_action.sql, 032_lms_mapping_additional_courses.sql, 038_lms_canvas_create_user_action.sql, 039_rename_lms_canvas_sync_state.sql, and 040_pa_day_camp_course_assignments.sql before saving LMS mappings' };
    }

    await sql`
      INSERT INTO camp_lms_course_mappings (
        course_id,
        lms_course_name,
        lms_course_link,
        notes,
        canvas_course_family,
        canvas_beginner_course_id,
        canvas_beginner_course_name,
        canvas_intermediate_course_id,
        canvas_intermediate_course_name,
        canvas_advanced_course_id,
        canvas_advanced_course_name,
        canvas_additional_course_ids,
        updated_at
      )
      VALUES (
        ${courseId},
        ${storedCourseName},
        ${lmsCourseLink || null},
        ${notes || null},
        NULL,
        ${canvasBeginnerCourseId || null},
        ${canvasBeginnerCourseName || null},
        ${canvasIntermediateCourseId || null},
        ${canvasIntermediateCourseName || null},
        ${canvasAdvancedCourseId || null},
        ${canvasAdvancedCourseName || null},
        ${sql.json(additionalIds as PostgresJsonValue)}::jsonb,
        NOW()
      )
      ON CONFLICT (course_id) DO UPDATE
      SET lms_course_name = EXCLUDED.lms_course_name,
          lms_course_link = EXCLUDED.lms_course_link,
          notes = EXCLUDED.notes,
          canvas_course_family = NULL,
          canvas_beginner_course_id = EXCLUDED.canvas_beginner_course_id,
          canvas_beginner_course_name = EXCLUDED.canvas_beginner_course_name,
          canvas_intermediate_course_id = EXCLUDED.canvas_intermediate_course_id,
          canvas_intermediate_course_name = EXCLUDED.canvas_intermediate_course_name,
          canvas_advanced_course_id = EXCLUDED.canvas_advanced_course_id,
          canvas_advanced_course_name = EXCLUDED.canvas_advanced_course_name,
          canvas_additional_course_ids = EXCLUDED.canvas_additional_course_ids,
          updated_at = NOW();
    `;

    await revalidateCampLmsPaths();
    return { ok: true };
  } catch (error) {
    console.error('Error saving camp LMS course mapping:', error);
    return { ok: false, error: 'Failed to save LMS course mapping' };
  }
}

export async function searchCampLmsCanvasCourses(input: { term: string }) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in', courses: [] };
  }

  const parsed = CampLmsCanvasCourseSearchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Search with at least 2 characters.', courses: [] };
  }

  try {
    if (!(await isCanvasTokenConfigured())) {
      return { ok: false, error: 'CANVAS_API_TOKEN is not configured for server-side Canvas search', courses: [] };
    }

    const client = createCanvasClient();
    const term = parsed.data.term;
    const courses: CanvasCourse[] = [];
    const directCourse = /^\d+$/.test(term) ? await client.getCourse(term) : null;
    if (directCourse) courses.push(directCourse);
    courses.push(...await client.searchCourses(term));

    const seen = new Set<string>();
    const deduped = courses
      .filter((course) => {
        const id = String(course.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 12)
      .map(canvasCourseSummary);

    return { ok: true, courses: deduped };
  } catch (error) {
    if (error instanceof CanvasConfigError) {
      return { ok: false, error: 'CANVAS_API_TOKEN is not configured for server-side Canvas search', courses: [] };
    }
    console.error('Error searching Canvas courses:', error);
    return { ok: false, error: canvasErrorMessage(error), courses: [] };
  }
}

export async function importCampLmsCourseMappings(input: { tableText: string }) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampLmsImportMappingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Paste a mapping table before importing' };
  }

  try {
    if (!(await campLmsChecklistSchemaReady())) {
      return { ok: false, error: 'Apply migrations 025_lms_camp_checklist.sql, 026_canvas_lms_workflow.sql, 027_rename_lms_status_note.sql, 030_lms_canvas_activate_course_action.sql, 032_lms_mapping_additional_courses.sql, 038_lms_canvas_create_user_action.sql, 039_rename_lms_canvas_sync_state.sql, and 040_pa_day_camp_course_assignments.sql before importing LMS mappings' };
    }

    const lines = parsed.data.tableText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) return { ok: false, error: 'Paste a mapping table before importing' };

    const firstCells = splitMappingLine(lines[0]);
    const firstHeaders = firstCells.map(normalizedHeader);
    const hasHeader = firstHeaders.some((header) =>
      header.includes('portal') || header.includes('beginner') || header.includes('intermediate') || header.includes('advanced')
    );
    const rows = hasHeader ? lines.slice(1) : lines;
    const headers = hasHeader ? firstHeaders : [];

    const portalIndex = hasHeader ? columnIndex(headers, ['portal', 'camp course', 'course id']) : 0;
    const beginnerIndex = hasHeader ? columnIndex(headers, ['beginner', 'general']) : 1;
    const intermediateIndex = hasHeader ? columnIndex(headers, ['intermediate']) : 2;
    const advancedIndex = hasHeader ? columnIndex(headers, ['advanced']) : 3;
    const additionalIndex = hasHeader ? columnIndex(headers, ['additional', 'additional ids', 'additional id']) : -1;
    const hasAdditionalColumn = hasHeader && additionalIndex >= 0;

    let imported = 0;
    for (const line of rows) {
      const cells = splitMappingLine(line);
      const portalCourse = cells[portalIndex]?.trim();
      if (!portalCourse) continue;

      const beginnerCell = cells[beginnerIndex]?.trim();
      const intermediateCell = cells[intermediateIndex]?.trim();
      const advancedCell = cells[advancedIndex]?.trim();
      const additionalCell = hasAdditionalColumn ? cells[additionalIndex]?.trim() : undefined;
      const beginnerId = extractCanvasCourseId(beginnerCell);
      const intermediateId = extractCanvasCourseId(intermediateCell);
      const advancedId = extractCanvasCourseId(advancedCell);
      const additionalIds = hasAdditionalColumn ? parseCanvasCourseIdList(additionalCell) : null;

      if (hasAdditionalColumn) {
        await sql`
          INSERT INTO camp_lms_course_mappings (
            course_id,
            lms_course_name,
            lms_course_link,
            canvas_course_family,
            canvas_beginner_course_id,
            canvas_beginner_course_name,
            canvas_intermediate_course_id,
            canvas_intermediate_course_name,
            canvas_advanced_course_id,
            canvas_advanced_course_name,
            canvas_additional_course_ids,
            updated_at
          )
          VALUES (
            ${portalCourse},
            ${portalCourse},
            ${beginnerCell?.startsWith('http') ? beginnerCell : null},
            NULL,
            ${beginnerId},
            ${extractCourseName(beginnerCell, beginnerId)},
            ${intermediateId},
            ${extractCourseName(intermediateCell, intermediateId)},
            ${advancedId},
            ${extractCourseName(advancedCell, advancedId)},
            ${sql.json(additionalIds as PostgresJsonValue)}::jsonb,
            NOW()
          )
          ON CONFLICT (course_id) DO UPDATE
          SET lms_course_name = EXCLUDED.lms_course_name,
              lms_course_link = COALESCE(EXCLUDED.lms_course_link, camp_lms_course_mappings.lms_course_link),
              canvas_course_family = NULL,
              canvas_beginner_course_id = EXCLUDED.canvas_beginner_course_id,
              canvas_beginner_course_name = EXCLUDED.canvas_beginner_course_name,
              canvas_intermediate_course_id = EXCLUDED.canvas_intermediate_course_id,
              canvas_intermediate_course_name = EXCLUDED.canvas_intermediate_course_name,
              canvas_advanced_course_id = EXCLUDED.canvas_advanced_course_id,
              canvas_advanced_course_name = EXCLUDED.canvas_advanced_course_name,
              canvas_additional_course_ids = EXCLUDED.canvas_additional_course_ids,
              updated_at = NOW();
        `;
        imported += 1;
        continue;
      }

      await sql`
        INSERT INTO camp_lms_course_mappings (
          course_id,
          lms_course_name,
          lms_course_link,
          canvas_course_family,
          canvas_beginner_course_id,
          canvas_beginner_course_name,
          canvas_intermediate_course_id,
          canvas_intermediate_course_name,
          canvas_advanced_course_id,
          canvas_advanced_course_name,
          updated_at
        )
        VALUES (
          ${portalCourse},
          ${portalCourse},
          ${beginnerCell?.startsWith('http') ? beginnerCell : null},
          NULL,
          ${beginnerId},
          ${extractCourseName(beginnerCell, beginnerId)},
          ${intermediateId},
          ${extractCourseName(intermediateCell, intermediateId)},
          ${advancedId},
          ${extractCourseName(advancedCell, advancedId)},
          NOW()
        )
        ON CONFLICT (course_id) DO UPDATE
        SET lms_course_name = EXCLUDED.lms_course_name,
            lms_course_link = COALESCE(EXCLUDED.lms_course_link, camp_lms_course_mappings.lms_course_link),
            canvas_course_family = NULL,
            canvas_beginner_course_id = EXCLUDED.canvas_beginner_course_id,
            canvas_beginner_course_name = EXCLUDED.canvas_beginner_course_name,
            canvas_intermediate_course_id = EXCLUDED.canvas_intermediate_course_id,
            canvas_intermediate_course_name = EXCLUDED.canvas_intermediate_course_name,
            canvas_advanced_course_id = EXCLUDED.canvas_advanced_course_id,
            canvas_advanced_course_name = EXCLUDED.canvas_advanced_course_name,
            updated_at = NOW();
      `;
      imported += 1;
    }

    await revalidateCampLmsPaths();
    return { ok: true, imported };
  } catch (error) {
    console.error('Error importing camp LMS course mappings:', error);
    return { ok: false, error: 'Failed to import LMS course mappings' };
  }
}

export async function updateCampLmsStatus(input: {
  enrolmentId: string;
  status: CampLmsStatus | null;
  note?: string;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampLmsStatusUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid LMS status update' };
  }

  const { enrolmentId, status, note } = parsed.data;

  try {
    if (!(await campLmsChecklistSchemaReady())) {
      return { ok: false, error: 'Apply migrations 025_lms_camp_checklist.sql, 026_canvas_lms_workflow.sql, 027_rename_lms_status_note.sql, 030_lms_canvas_activate_course_action.sql, 032_lms_mapping_additional_courses.sql, 038_lms_canvas_create_user_action.sql, 039_rename_lms_canvas_sync_state.sql, and 040_pa_day_camp_course_assignments.sql before saving LMS statuses' };
    }

    if (!status) {
      await sql`
        DELETE FROM camp_lms_status_checks
        WHERE camp_enrolment_id = ${enrolmentId}::uuid;
      `;
    } else {
      await sql`
        INSERT INTO camp_lms_status_checks (
          camp_enrolment_id,
          status,
          lms_note,
          checked_by,
          checked_at,
          updated_at
        )
        VALUES (
          ${enrolmentId}::uuid,
          ${status},
          ${note || null},
          ${userId},
          NOW(),
          NOW()
        )
        ON CONFLICT (camp_enrolment_id) DO UPDATE
        SET status = EXCLUDED.status,
            lms_note = EXCLUDED.lms_note,
            checked_by = EXCLUDED.checked_by,
            checked_at = NOW(),
            updated_at = NOW();
      `;
    }

    await revalidateCampLmsPaths();
    return { ok: true };
  } catch (error) {
    console.error('Error updating camp LMS status:', error);
    return { ok: false, error: 'Failed to update LMS status' };
  }
}

export async function runCampLmsCanvasTestAction(input: {
  campEnrolmentId: string;
  type: CampLmsCanvasActionType;
  canvasCourseId?: string;
  canvasEnrollmentId?: string;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampLmsCanvasActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid Canvas test action' };
  }

  const { campEnrolmentId, type, canvasCourseId, canvasEnrollmentId } = parsed.data;

  try {
    if (!(await campLmsChecklistSchemaReady())) {
      return { ok: false, error: 'Apply migrations 025_lms_camp_checklist.sql, 026_canvas_lms_workflow.sql, 027_rename_lms_status_note.sql, 030_lms_canvas_activate_course_action.sql, 032_lms_mapping_additional_courses.sql, 038_lms_canvas_create_user_action.sql, 039_rename_lms_canvas_sync_state.sql, and 040_pa_day_camp_course_assignments.sql before running Canvas actions' };
    }
    if (!(await isCanvasTokenConfigured())) {
      return { ok: false, error: 'CANVAS_API_TOKEN is not configured for server-side Canvas test actions' };
    }

    const client = createCanvasClient();
    const syncRow = await fetchSingleCampLmsSyncRow(campEnrolmentId);
    if (!syncRow) {
      return { ok: false, error: 'Camp enrolment not found' };
    }

    const preflightSync = await syncCampLmsCanvasState(syncRow, client);
    if (!preflightSync.ok) {
      return { ok: false, error: `Sync LMS failed before the Canvas action: ${preflightSync.error ?? 'unknown error'}` };
    }

    const row = await fetchCampLmsCanvasActionRow(campEnrolmentId);

    if (!row) {
      return { ok: false, error: 'Camp enrolment not found' };
    }
    if (type !== 'create_user' && !row.canvas_user_id) {
      return { ok: false, error: 'Canvas did not find a user for this camper. Create or resolve the Canvas user before changing courses.' };
    }
    if (type === 'create_user' && row.canvas_user_id) {
      return { ok: false, error: 'A Canvas user already exists for this camper.' };
    }
    if (type === 'create_user' && row.canvas_sync_status !== 'synced') {
      return { ok: false, error: 'Canvas user lookup did not finish cleanly. Try again after Sync LMS succeeds.' };
    }
    if (type === 'create_user' && row.canvas_user_found) {
      return { ok: false, error: 'A Canvas user is already matched for this camper.' };
    }
    if (
      type === 'create_user'
      && Array.isArray(row.canvas_user_matches)
      && row.canvas_user_matches.length > 0
    ) {
      return { ok: false, error: 'Canvas returned possible matching users. Resolve the match manually before creating a new user.' };
    }

    const beforeState = await fetchCampLmsCanvasSyncState(campEnrolmentId);
    const requestPayload: Record<string, string> = { type };
    const activeEnrollments = Array.isArray(row.active_enrollments)
      ? row.active_enrollments as Array<Record<string, unknown>>
      : [];
    const expectedCourseIds = new Set(
      [
        row.canvas_beginner_course_id,
        row.canvas_intermediate_course_id,
        row.canvas_advanced_course_id,
        ...parseCanvasCourseIdList(Array.isArray(row.canvas_additional_course_ids)
          ? row.canvas_additional_course_ids.join(',')
          : ''
        ),
      ].filter((courseId): courseId is string => Boolean(courseId))
    );
    let responsePayload: unknown = null;
    let afterState: CampLmsCanvasSyncState | null = null;
    let success = false;
    let warning: string | null = null;
    let apiError: string | null = null;
    let courseId: string | null = null;
    let enrollmentId: string | null = null;
    let auditCanvasUserId: string | null = row.canvas_user_id;
    // Every action except create_user is gated by the canvas_user_id guard above.
    const enrollUserId = row.canvas_user_id as string;

    try {
      if (type === 'create_user') {
        const login = `${row.student_id}@zebrarobotics.com`;
        requestPayload.name = row.student_name;
        requestPayload.loginId = login;
        requestPayload.email = login;
        const created = await client.createUser({
          name: row.student_name,
          loginId: login,
          email: login,
        });
        responsePayload = created;
        const newId = (created as { id?: unknown })?.id;
        if (newId != null) {
          auditCanvasUserId = String(newId);
        }
      } else if (type === 'add_expected_beginner') {
        courseId = canvasCourseId || row.canvas_beginner_course_id;
        if (!courseId || courseId !== row.canvas_beginner_course_id) {
          throw new Error('Expected Canvas course is not mapped for this camper.');
        }
        const alreadyActive = activeEnrollments.some((candidate) => expectedCourseIds.has(String(candidate.course_id)));
        if (alreadyActive) {
          throw new Error('An expected Canvas course is already active in the latest Canvas sync. Sync LMS before trying again.');
        }
        requestPayload.canvasCourseId = courseId;
        requestPayload.canvasUserId = enrollUserId;
        responsePayload = await client.enrollStudent(courseId, enrollUserId);
      } else if (type === 'activate_course') {
        courseId = canvasCourseId ?? null;
        enrollmentId = canvasEnrollmentId ?? null;
        if (!courseId) {
          throw new Error('Choose a Canvas course to set active.');
        }

        const inactiveEnrollments = Array.isArray(row.inactive_enrollments)
          ? row.inactive_enrollments as Array<Record<string, unknown>>
          : [];
        if (enrollmentId) {
          const enrollment = inactiveEnrollments.find((candidate) =>
            String(candidate.enrollment_id) === enrollmentId && String(candidate.course_id) === courseId
          );
          if (!enrollment) {
            throw new Error('The selected enrollment is not in the latest inactive Canvas sync. Sync LMS before trying again.');
          }
        } else {
          const alreadyActive = activeEnrollments.some((candidate) => String(candidate.course_id) === courseId);
          if (alreadyActive) {
            throw new Error('This Canvas course is already active for this camper. Sync LMS if the checklist looks stale.');
          }
          const inactiveEnrollment = inactiveEnrollments.find((candidate) => String(candidate.course_id) === courseId);
          if (inactiveEnrollment) {
            throw new Error('This Canvas course is already inactive for this camper. Use Make active on the inactive enrollment instead.');
          }
        }

        requestPayload.canvasCourseId = courseId;
        requestPayload.canvasUserId = enrollUserId;
        if (enrollmentId) {
          // Reactivate the existing inactive enrollment rather than POSTing a new
          // one, which would leave a duplicate if the original sat in a non-default section.
          requestPayload.canvasEnrollmentId = enrollmentId;
          responsePayload = await client.reactivateEnrollment(courseId, enrollmentId);
        } else {
          responsePayload = await client.enrollStudent(courseId, enrollUserId);
        }
      } else {
        const requestedCourseId = canvasCourseId ?? null;
        const requestedEnrollmentId = canvasEnrollmentId ?? null;

        // Resolve the target from the latest synced active enrollments. The client
        // may send only one of the two ids; derive the other here so a missing
        // enrollment id no longer blocks the inactivate write (the original bug).
        const enrollment = activeEnrollments.find((candidate) => {
          const candidateEnrollmentId = candidate.enrollment_id == null ? null : String(candidate.enrollment_id);
          const candidateCourseId = candidate.course_id == null ? null : String(candidate.course_id);
          if (requestedEnrollmentId && candidateEnrollmentId !== requestedEnrollmentId) return false;
          if (requestedCourseId && candidateCourseId !== requestedCourseId) return false;
          return Boolean(requestedEnrollmentId) || Boolean(requestedCourseId);
        });

        if (!enrollment) {
          console.error('[lms inactivate] no matching active enrollment', {
            campEnrolmentId,
            receivedCourseId: requestedCourseId,
            receivedEnrollmentId: requestedEnrollmentId,
            activeEnrollmentCount: activeEnrollments.length,
            activeEnrollmentSample: activeEnrollments.slice(0, 5).map((candidate) => ({
              enrollment_id: candidate.enrollment_id ?? null,
              course_id: candidate.course_id ?? null,
              state: candidate.state ?? null,
            })),
          });
          throw new Error(
            requestedCourseId || requestedEnrollmentId
              ? 'The selected enrollment is not in the latest active Canvas sync. Sync LMS before trying again.'
              : 'Choose an active Canvas enrollment to set inactive.'
          );
        }

        courseId = enrollment.course_id == null ? null : String(enrollment.course_id);
        enrollmentId = enrollment.enrollment_id == null ? null : String(enrollment.enrollment_id);
        if (!courseId || !enrollmentId) {
          throw new Error('The selected Canvas enrollment is missing its course or enrollment id in the latest sync. Sync LMS and try again.');
        }
        if (expectedCourseIds.has(courseId)) {
          throw new Error('Refusing to set an expected Canvas course inactive for this camper.');
        }

        const [mappedCourse] = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM camp_lms_course_mappings
            WHERE ${courseId} IN (
              canvas_beginner_course_id,
              canvas_intermediate_course_id,
              canvas_advanced_course_id
            )
            OR canvas_additional_course_ids ? ${courseId}
          ) AS exists;
        `;
        if (!mappedCourse?.exists) {
          throw new Error('The selected enrollment is not one of the mapped Canvas camp courses.');
        }

        requestPayload.canvasCourseId = courseId;
        requestPayload.canvasEnrollmentId = enrollmentId;
        responsePayload = await client.inactivateEnrollment(courseId, enrollmentId);
      }

      const syncResult = await syncCampLmsCanvasState(syncRow, client);
      afterState = await fetchCampLmsCanvasSyncState(campEnrolmentId);
      if (!syncResult.ok) {
        warning = `Canvas write completed, but Sync LMS failed: ${syncResult.error ?? 'unknown error'}`;
      } else if (type === 'create_user' && !syncResult.userFound) {
        warning = 'Canvas user was created, but Sync LMS did not find it yet. Wait briefly, then sync again.';
      }
      success = true;
    } catch (error) {
      apiError = canvasErrorMessage(error);
    }

    await sql`
      INSERT INTO camp_lms_canvas_action_audit (
        camp_enrolment_id,
        student_id,
        action_type,
        canvas_user_id,
        canvas_course_id,
        canvas_enrollment_id,
        requested_by,
        requested_by_name,
        before_state,
        after_state,
        request_payload,
        response_payload,
        success,
        error
      )
      VALUES (
        ${campEnrolmentId}::uuid,
        ${row.student_id},
        ${type},
        ${auditCanvasUserId},
        ${courseId},
        ${enrollmentId},
        ${userId},
        ${session.user?.name ?? null},
        ${sql.json((beforeState ?? {}) as PostgresJsonValue)}::jsonb,
        ${sql.json((afterState ?? {}) as PostgresJsonValue)}::jsonb,
        ${sql.json(requestPayload as PostgresJsonValue)}::jsonb,
        ${sql.json((responsePayload ?? {}) as PostgresJsonValue)}::jsonb,
        ${success},
        ${apiError}
      );
    `;

    await revalidateCampLmsPaths();
    if (!success) {
      return { ok: false, error: apiError ?? 'Canvas test action failed' };
    }

    return warning ? { ok: true, warning } : { ok: true };
  } catch (error) {
    if (error instanceof CanvasConfigError) {
      return { ok: false, error: 'CANVAS_API_TOKEN is not configured for server-side Canvas test actions' };
    }
    console.error('Error running camp LMS Canvas test action:', error);
    return { ok: false, error: 'Failed to run Canvas test action' };
  }
}

export async function updateCampSeatAssignment(
  enrolmentId: string,
  seatNumber: number | null,
  date?: Date | string
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    if (date) {
      const dateKey = toLocalDateKey(date);

      if (seatNumber === null) {
        await sql`
          DELETE FROM seat_assignments
          WHERE enrolment_id = ${enrolmentId} AND date = ${dateKey}::date;
        `;
      } else {
        await sql`
          INSERT INTO seat_assignments (enrolment_id, date, seat)
          VALUES (${enrolmentId}, ${dateKey}::date, ${seatNumber})
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

    // updateTag (not revalidateTag) so the page load right after a save sees
    // the write immediately instead of a stale cached "camps" entry.
    updateTag('camps');
    return { ok: true };
  } catch (error) {
    console.error('Error updating seat assignment:', error);
    return { ok: false, error: `Failed to update seat assignment: ${String((error as any)?.message ?? error)}` };
  }
}

export async function autoPopulateCampSeatAssignmentsForDate(date: Date | string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const dateKey = toLocalDateKey(date);
    const [year, month, day] = dateKey.split('-').map(Number);
    const localTargetDate = new Date(year, month - 1, day);
    const dayOfWeek = localTargetDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStartDate = new Date(localTargetDate);
    weekStartDate.setDate(localTargetDate.getDate() - daysFromMonday);
    const weekStartKey = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`;

    const dayEnrolments = await sql<Array<{
      enrolment_id: string;
      camp_type: 'FD' | 'AM' | 'PM';
      assigned_seat_number: number | null;
    }>>`
      SELECT
        ce.id::text AS enrolment_id,
        cs.camp_type,
        ce.assigned_seat_number
      FROM camp_sessions cs
      JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
      WHERE cs.start_date <= ${dateKey}::date
        AND cs.end_date >= ${dateKey}::date
    `;

    if (dayEnrolments.length === 0) {
      return { ok: true, created: 0, assignments: [] as Array<{ enrolment_id: string; seat: number }> };
    }

    const enrolmentIds = dayEnrolments.map((row) => row.enrolment_id);
    const enrolmentById = new Map(dayEnrolments.map((row) => [row.enrolment_id, row]));

    const existingRows = await sql<Array<{ enrolment_id: string; seat: number }>>`
      SELECT enrolment_id::text AS enrolment_id, seat
      FROM seat_assignments
      WHERE date = ${dateKey}::date
        AND enrolment_id = ANY(${enrolmentIds}::uuid[])
    `;

    const assignedIds = new Set<string>();
    const seatOccupancy = new Map<number, { am?: string; pm?: string; fd?: string }>();

    for (const row of existingRows) {
      const enrolment = enrolmentById.get(row.enrolment_id);
      if (!enrolment) continue;

      assignedIds.add(row.enrolment_id);
      const occupancy = seatOccupancy.get(row.seat) ?? {};
      if (enrolment.camp_type === 'AM') occupancy.am = row.enrolment_id;
      if (enrolment.camp_type === 'PM') occupancy.pm = row.enrolment_id;
      if (enrolment.camp_type === 'FD') occupancy.fd = row.enrolment_id;
      seatOccupancy.set(row.seat, occupancy);
    }

    const isSeatAvailableForCampType = (seat: number, campType: 'FD' | 'AM' | 'PM') => {
      const occupancy = seatOccupancy.get(seat);
      if (!occupancy) return true;
      if (campType === 'FD') return !occupancy.fd && !occupancy.am && !occupancy.pm;
      if (campType === 'AM') return !occupancy.fd && !occupancy.am;
      return !occupancy.fd && !occupancy.pm;
    };

    const markSeatOccupied = (enrolmentId: string, seat: number) => {
      const enrolment = enrolmentById.get(enrolmentId);
      if (!enrolment) return;
      assignedIds.add(enrolmentId);
      const occupancy = seatOccupancy.get(seat) ?? {};
      if (enrolment.camp_type === 'AM') occupancy.am = enrolmentId;
      if (enrolment.camp_type === 'PM') occupancy.pm = enrolmentId;
      if (enrolment.camp_type === 'FD') occupancy.fd = enrolmentId;
      seatOccupancy.set(seat, occupancy);
    };

    const plannedAssignments = new Map<string, number>();

    const unassignedEnrolments = dayEnrolments.filter((enrolment) => !assignedIds.has(enrolment.enrolment_id));

    if (unassignedEnrolments.length > 0) {
      const recentRows = await sql<Array<{ enrolment_id: string; seat: number }>>`
        WITH calendar_days AS (
          SELECT day::date AS day
          FROM generate_series(
            ${weekStartKey}::date,
            (${dateKey}::date - INTERVAL '1 day')::date,
            INTERVAL '1 day'
          ) AS day
        ),
        ranked AS (
          SELECT
            sa.enrolment_id::text AS enrolment_id,
            sa.seat,
            ROW_NUMBER() OVER (
              PARTITION BY sa.enrolment_id
              ORDER BY sa.date DESC
            ) AS rn
          FROM calendar_days cd
          JOIN seat_assignments sa ON sa.date = cd.day
          WHERE sa.enrolment_id = ANY(${unassignedEnrolments.map((row) => row.enrolment_id)}::uuid[])
        )
        SELECT enrolment_id, seat
        FROM ranked
        WHERE rn = 1
      `;

      const recentSeatByEnrolmentId = new Map(recentRows.map((row) => [row.enrolment_id, row.seat]));

      for (const enrolment of unassignedEnrolments) {
        const previousSeat = recentSeatByEnrolmentId.get(enrolment.enrolment_id);
        if (previousSeat == null) continue;
        if (!isSeatAvailableForCampType(previousSeat, enrolment.camp_type)) continue;

        plannedAssignments.set(enrolment.enrolment_id, previousSeat);
        markSeatOccupied(enrolment.enrolment_id, previousSeat);
      }
    }

    const stillUnassigned = dayEnrolments.filter((enrolment) => !assignedIds.has(enrolment.enrolment_id));
    for (const enrolment of stillUnassigned) {
      const defaultSeat = enrolment.assigned_seat_number;
      if (defaultSeat == null) continue;
      if (!isSeatAvailableForCampType(defaultSeat, enrolment.camp_type)) continue;

      plannedAssignments.set(enrolment.enrolment_id, defaultSeat);
      markSeatOccupied(enrolment.enrolment_id, defaultSeat);
    }

    for (const [enrolmentId, seat] of plannedAssignments.entries()) {
      await sql`
        INSERT INTO seat_assignments (enrolment_id, date, seat)
        VALUES (${enrolmentId}::uuid, ${dateKey}::date, ${seat})
        ON CONFLICT (enrolment_id, date) DO UPDATE
        SET seat = EXCLUDED.seat
      `;
    }

    const assignments = await sql<Array<{ enrolment_id: string; seat: number }>>`
      SELECT enrolment_id::text AS enrolment_id, seat
      FROM seat_assignments
      WHERE date = ${dateKey}::date
        AND enrolment_id = ANY(${enrolmentIds}::uuid[])
    `;

    updateTag('camps');
    revalidatePath(`/dashboard/camp/day/${dateKey}`);

    return { ok: true, created: plannedAssignments.size, assignments };
  } catch (error) {
    console.error('Error auto-populating seat assignments:', error);
    return { ok: false, error: `Failed to auto-populate seat assignments: ${String((error as any)?.message ?? error)}` };
  }
}

export async function updateCampPrintableStudentListOverride(input: {
  weekStart: string;
  weekEnd: string;
  studentId: string;
  field: CampPrintableStudentListField;
  value: string;
}) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: 'Unauthorized: Please log in' };
  }

  const parsed = CampPrintableStudentListOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid printable student list update' };
  }

  try {
    const ready = await campPrintStudentListOverridesReady();
    if (!ready) {
      return {
        ok: false,
        error: 'Printable student list saving needs migration 026 applied.',
      };
    }

    const updatedBy =
      session.user.email ?? session.user.name ?? getSessionUserId(session) ?? 'unknown';
    const { weekStart, weekEnd, studentId, field, value } = parsed.data;
    const normalizedStudentId = studentId.includes('.')
      ? studentId.replace(/\.0+$/, '')
      : studentId;

    await sql`
      INSERT INTO camp_print_student_list_overrides (
        week_start,
        week_end,
        student_id,
        field,
        value,
        updated_by,
        updated_at
      )
      VALUES (
        ${weekStart}::date,
        ${weekEnd}::date,
        ${normalizedStudentId}::numeric,
        ${field},
        ${value},
        ${updatedBy},
        NOW()
      )
      ON CONFLICT (week_start, week_end, student_id, field) DO UPDATE
      SET value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW();
    `;

    revalidateTag('camps', 'max');
    revalidatePath(`/dashboard/camp/${weekStart}/${weekEnd}/printable`);
    return { ok: true };
  } catch (error) {
    console.error('Error updating printable camp student list override:', error);
    return { ok: false, error: 'Failed to save printable student list update' };
  }
}

export async function updateCampEnrolmentNote(
  enrolmentId: string,
  note: string
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const trimmedNote = note.trim();

    if (!(await campEnrolmentNoteColumnExists())) {
      return { ok: false, error: 'Apply migration 028_add_camp_roster_contact_fields.sql before saving camp notes' };
    }

    await sql`
      UPDATE camp_enrolments
      SET note = ${trimmedNote || null}
      WHERE id = ${enrolmentId};
    `;

    revalidateTag('camps', 'max');
    return { ok: true };
  } catch (error) {
    console.error('Error updating camp enrolment note:', error);
    return { ok: false, error: 'Failed to update camp enrolment note' };
  }
}

const CampActivityScheduleCellSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid week start'),
  blockKey: z.enum(['morning', 'afternoon']),
  room: z.enum(['Front', 'Back']),
  weekday: z.coerce.number().int().min(1).max(5),
  activity: z.string(),
});

export async function updateCampActivityScheduleCell(input: {
  weekStart: string;
  blockKey: string;
  room: string;
  weekday: number;
  activity: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const parsed = CampActivityScheduleCellSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid activity schedule cell' };
    }

    const { weekStart, blockKey, room, weekday } = parsed.data;
    const activity = parsed.data.activity.trim();

    if (!activity) {
      await sql`
        DELETE FROM camp_activity_schedules
        WHERE week_start = ${weekStart}::date
          AND block_key = ${blockKey}
          AND room = ${room}
          AND weekday = ${weekday};
      `;
    } else {
      await sql`
        INSERT INTO camp_activity_schedules (week_start, block_key, room, weekday, activity, updated_at)
        VALUES (${weekStart}::date, ${blockKey}, ${room}, ${weekday}, ${activity}, NOW())
        ON CONFLICT (week_start, block_key, room, weekday) DO UPDATE
        SET activity = EXCLUDED.activity,
            updated_at = NOW();
      `;
    }

    revalidateTag('camps', 'max');
    return { ok: true };
  } catch (error) {
    console.error('Error updating camp activity schedule:', error);
    return { ok: false, error: 'Failed to update camp activity schedule' };
  }
}

const CAMP_STAFF_SCHEDULE_ROW_KEYS = [
  'morning_dropoff',
  'coach_lunch_front',
  'coach_lunch_back',
  'camp_programs_front',
  'camp_programs_back',
  'extended_care_back',
  'evening_classes',
] as const;

const CampStaffScheduleCellSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid week start'),
  rowKey: z.enum(CAMP_STAFF_SCHEDULE_ROW_KEYS),
  weekday: z.coerce.number().int().min(1).max(5),
  content: z.string(),
});

export async function updateCampStaffScheduleCell(input: {
  weekStart: string;
  rowKey: string;
  weekday: number;
  content: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const parsed = CampStaffScheduleCellSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid staff schedule cell' };
    }

    const { weekStart, rowKey, weekday } = parsed.data;
    const content = parsed.data.content.trim();

    if (!content) {
      await sql`
        DELETE FROM camp_staff_schedules
        WHERE week_start = ${weekStart}::date
          AND row_key = ${rowKey}
          AND weekday = ${weekday};
      `;
    } else {
      await sql`
        INSERT INTO camp_staff_schedules (week_start, row_key, weekday, content, updated_at)
        VALUES (${weekStart}::date, ${rowKey}, ${weekday}, ${content}, NOW())
        ON CONFLICT (week_start, row_key, weekday) DO UPDATE
        SET content = EXCLUDED.content,
            updated_at = NOW();
      `;
    }

    revalidateTag('camps', 'max');
    return { ok: true };
  } catch (error) {
    console.error('Error updating camp staff schedule:', error);
    return { ok: false, error: 'Failed to update camp staff schedule' };
  }
}

const CampPrintLogStatusSchema = z.enum(['', 'ready', 'printing', 'done']);

const CampPrintLogEntrySchema = z.object({
  id: z.coerce.number().int().positive(),
  student: z.string(),
  printDescription: z.string(),
  status: CampPrintLogStatusSchema,
  notes: z.string(),
});

export async function createCampPrintLogEntry(input: { weekStart: string }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const weekStart = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid week start')
      .safeParse(input.weekStart);
    if (!weekStart.success) {
      return { ok: false, error: 'Invalid week start' };
    }

    const rows = await sql<Array<{ id: number }>>`
      INSERT INTO camp_print_log (week_start, position)
      VALUES (
        ${weekStart.data}::date,
        COALESCE(
          (SELECT MAX(position) + 1 FROM camp_print_log WHERE week_start = ${weekStart.data}::date),
          0
        )
      )
      RETURNING id;
    `;

    revalidateTag('camps', 'max');
    return { ok: true, id: rows[0].id };
  } catch (error) {
    console.error('Error creating camp print log entry:', error);
    return { ok: false, error: 'Failed to add print log row' };
  }
}

// Seed a week's print log with one empty row per enrolled student. Inserts only
// when the week has no rows yet, so re-opening the tab (or a deliberately
// emptied log) never re-adds students. The NOT EXISTS guard lives inside the
// single INSERT statement so concurrent calls can't double-seed.
export async function seedCampPrintLogEntries(input: {
  weekStart: string;
  students: string[];
}) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const weekStart = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid week start')
      .safeParse(input.weekStart);
    if (!weekStart.success) {
      return { ok: false, error: 'Invalid week start' };
    }

    const students = (input.students ?? [])
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0);
    if (students.length === 0) {
      return { ok: true, rows: [] as CampPrintLogEntry[] };
    }

    const rows = await sql<Array<CampPrintLogEntry>>`
      INSERT INTO camp_print_log (week_start, position, student)
      SELECT ${weekStart.data}::date, ord - 1, name
      FROM UNNEST(${students}::text[]) WITH ORDINALITY AS s(name, ord)
      WHERE NOT EXISTS (
        SELECT 1 FROM camp_print_log WHERE week_start = ${weekStart.data}::date
      )
      RETURNING id, student, print_description, status, notes;
    `;

    revalidateTag('camps', 'max');
    return { ok: true, rows };
  } catch (error) {
    console.error('Error seeding camp print log entries:', error);
    return { ok: false, error: 'Failed to seed print log' };
  }
}

export async function updateCampPrintLogEntry(input: {
  id: number;
  student: string;
  printDescription: string;
  status: string;
  notes: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const parsed = CampPrintLogEntrySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid print log row' };
    }

    const { id, student, printDescription, status, notes } = parsed.data;

    await sql`
      UPDATE camp_print_log
      SET student = ${student.trim() || null},
          print_description = ${printDescription.trim() || null},
          status = ${status || null},
          notes = ${notes.trim() || null},
          updated_at = NOW()
      WHERE id = ${id};
    `;

    revalidateTag('camps', 'max');
    return { ok: true };
  } catch (error) {
    console.error('Error updating camp print log entry:', error);
    return { ok: false, error: 'Failed to update print log row' };
  }
}

export async function deleteCampPrintLogEntry(input: { id: number }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const id = z.coerce.number().int().positive().safeParse(input.id);
    if (!id.success) {
      return { ok: false, error: 'Invalid print log row' };
    }

    await sql`DELETE FROM camp_print_log WHERE id = ${id.data};`;

    revalidateTag('camps', 'max');
    return { ok: true };
  } catch (error) {
    console.error('Error deleting camp print log entry:', error);
    return { ok: false, error: 'Failed to delete print log row' };
  }
}

export async function createSlipsForCampers(enrolments: CampEnrolmentWithStudent[]) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return { ok: false, error: 'Unauthorized: Please log in' };
    }

    const enrolment_info = await sql<Array<{
      student_id: string;
      student_name: string;
      course: string;
      session: 'FD' | 'PM' | 'AM';
      extended_care: boolean;
      other_fields: { [key: string]: string } | null;
    }>>`
      SELECT 
        ce.student_id,
        s.name as student_name,
        CASE
          WHEN LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
            AND pa_day.assigned_course_id IS NOT NULL
          THEN COALESCE(assigned_course.name, assigned_mapping.lms_course_name, pa_day.assigned_course_id)
          ELSE c.name
        END as course,
        cs.camp_type as session,
        cs.extended_care,
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
      LEFT JOIN camp_pa_day_course_assignments pa_day ON pa_day.camp_enrolment_id = ce.id
      LEFT JOIN courses assigned_course ON assigned_course.id::text = pa_day.assigned_course_id
      LEFT JOIN camp_lms_course_mappings assigned_mapping ON assigned_mapping.course_id = pa_day.assigned_course_id
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
      const otherFieldsValue = other_fields ? sql`${sql.json(other_fields)}::jsonb` : sql`NULL`;

      const sessionLabel = enrolment.extended_care && (enrolment.session === 'FD' || enrolment.session === 'PM')
        ? `${enrolment.session}-EX`
        : enrolment.session;

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
          ${`${enrolment.course} ${sessionLabel}`},
          ${otherFieldsValue}
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

export async function createIncidentReport(_prevState: unknown, formData: FormData) {
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

export async function updateIncidentReportStatus(_prevState: unknown, formData: FormData) {
  const session = await auth();
  const userType = getSessionUserType(session);

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

function isAllowedShiftType(value: string): value is typeof ALLOWED_SHIFT_TYPES[number] {
  return ALLOWED_SHIFT_TYPES.includes(value as typeof ALLOWED_SHIFT_TYPES[number]);
}

function parseShiftTypes(formData: FormData): string[] {
  const values = formData
    .getAll('shiftTypes')
    .map((v) => String(v))
    .filter(isAllowedShiftType);
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
  const userId = getSessionUserId(session);
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
  const userId = getSessionUserId(session);
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
  const userId = getSessionUserId(session);
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
  const userId = getSessionUserId(session);
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

// The three attendance states the portal tracks for an enrolled student on a
// given session date.
export type PortalAttendanceValue = 'present' | 'absent' | 'unmarked';

export type SetPortalAttendanceInput = {
  // Identifiers from the schedule row. The portal write helper will resolve
  // these (plus the session's batch) into the portal's attendance mutation.
  enrolmentId: string;
  studentId: string;
  // The session date this attendance applies to, as 'YYYY-MM-DD'.
  date: string;
  value: PortalAttendanceValue;
};

// Maps the UI's attendance value to the portal's attendance status label.
const PORTAL_ATTENDANCE_STATUS: Record<PortalAttendanceValue, AttendanceStatus> = {
  present: 'Present',
  absent: 'Absent',
  unmarked: 'Unmarked',
};

/**
 * Set a student's attendance value in the Zebra portal for a session date.
 *
 * Resolves the session's day/time from the enrolment (the portal helper matches
 * that slot against the student's active portal enrolments to find the batch),
 * then writes the attendance via markStudentAttendance. The schedule row only
 * carries regular enrolments here, so makeup is always false.
 * See the portal-write-api-contract memory for the auth/endpoint pattern.
 */
export async function setPortalAttendance(
  input: SetPortalAttendanceInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const rows = await sql<{ weekday: string; start_time: string; end_time: string | null }[]>`
      SELECT sess.weekday, sess.start_time, sess.end_time
      FROM enrolments e
      JOIN sessions sess ON sess.id = e.session_id
      WHERE e.id = ${input.enrolmentId}
      LIMIT 1;
    `;
    const session = rows[0];
    if (!session) {
      return { ok: false, error: `Enrolment ${input.enrolmentId} not found.` };
    }

    await markStudentAttendance({
      studentId: Number(input.studentId),
      day: session.weekday,
      startTime: session.start_time,
      endTime: session.end_time ?? undefined,
      date: input.date,
      makeup: false,
      status: PORTAL_ATTENDANCE_STATUS[input.value],
    });

    revalidatePath('/dashboard/schedule');
    return { ok: true };
  } catch (error) {
    console.error('[setPortalAttendance] failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to set attendance.' };
  }
}

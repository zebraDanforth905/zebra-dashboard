'use server'

import postgres from 'postgres';
import { nextOccurrenceOf } from './utils';
import { startOfScheduleWeek } from './schedule-week';
import { fetchAttendanceReport } from './scraper_helpers';
import {
  InvoiceTableData,
  CustomerTableData,
  ScheduleRow,
  StudentTableData,
  Session,
  RecurringInvoice,
  RecurringInvoiceListData,
  TrialRow,
  MakeupRow,
  PickupListDisplay,
  SlipInfo,
  StudentNote,
  CustomerNote,
  TrialNote,
  CampLmsCanvasEnrollment,
  CampLmsCanvasIssue,
  CampLmsCanvasMatch,
  CampLmsChecklistData,
  CampLmsChecklistRow,
  CampLmsChecklistSummary,
  CampLmsCourseMappingsData,
  CampLmsCourseMappingRow,
  CampLmsExpectedCourse,
  CampLmsDayCampCourseOption,
  CampLmsSuggestedAction,
  CampAccountPrepChecklistData,
  CampAccountPrepCourseOption,
  CampAccountPrepRow,
  CampAccountPrepSummary,
  CampPrepResourceKind,
  CampPrepStatus,
  CampPrintableScheduleData,
  CampPrintableScheduleRow,
  CampSessionWithEnrolments,
  CampPrintableStudentListOverride,
} from './definitions';
import { getCanvasPublicConfig } from './canvas-lms';
import { cacheTag, unstable_cache } from 'next/cache';



const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;
type Weekday = typeof WEEKDAYS[number];

const ITEMS_PER_PAGE = 6;

export async function fetchFilteredCustomers(
  query: string,
  currentPage: number,
  sortBy: string,
  incDec: boolean,
  qboFilter?: string,
  balanceFilter?: string,
  studentsFilter?: string,
  paymentsFilter?: string,
  recurringPaymentsFilter?: string,
  scheduledInvoicesFilter?: string,
  paymentMatchFilter?: string,
) {
  'use cache'
  cacheTag('customers');
  cacheTag('invoices');
  cacheTag('schedules');
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  
  // Build WHERE clause based on filters
  let whereConditions = sql`(
    c.name ILIKE '%' || ${query} || '%'
    OR c.email ILIKE '%' || ${query} || '%'
    OR COALESCE(c.alternate_name, '') ILIKE '%' || ${query} || '%'
    OR COALESCE(c.alternate_email, '') ILIKE '%' || ${query} || '%'
  )`;
  
  if (qboFilter === 'setup') {
    whereConditions = sql`${whereConditions} AND c.set_up_qbo = true`;
  } else if (qboFilter === 'not-setup') {
    whereConditions = sql`${whereConditions} AND (c.set_up_qbo = false OR c.set_up_qbo IS NULL)`;
  }
  
  // Build HAVING clause for aggregated filters
  let havingConditions = sql`TRUE`;
  
  if (balanceFilter === 'has-balance') {
    havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) != 0`;
  } else if (balanceFilter === 'no-balance') {
    havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) = 0`;
  }
  
  if (studentsFilter === 'has-students') {
    havingConditions = sql`${havingConditions} AND JSONB_ARRAY_LENGTH(COALESCE(stu.students, '[]'::jsonb)) > 0`;
  } else if (studentsFilter === 'no-students') {
    havingConditions = sql`${havingConditions} AND JSONB_ARRAY_LENGTH(COALESCE(stu.students, '[]'::jsonb)) = 0`;
  } else if (studentsFilter === 'has-active-students') {
    havingConditions = sql`${havingConditions} AND stu.active_students_count > 0`;
  } else if (studentsFilter === 'no-active-students') {
    havingConditions = sql`${havingConditions} AND (stu.active_students_count = 0 OR stu.active_students_count IS NULL)`;
  }
  
  if (paymentsFilter === 'has-recurring') {
    havingConditions = sql`${havingConditions} AND crp.next_payment IS NOT NULL`;
  } else if (paymentsFilter === 'has-invoices') {
    havingConditions = sql`${havingConditions} AND rec.next_invoice_date IS NOT NULL`;
  } else if (paymentsFilter === 'no-upcoming') {
    havingConditions = sql`${havingConditions} AND crp.next_payment IS NULL AND rec.next_invoice_date IS NULL`;
  }
  
  if (recurringPaymentsFilter === 'has-next-payment') {
    havingConditions = sql`${havingConditions} AND crp.next_payment IS NOT NULL`;
  } else if (recurringPaymentsFilter === 'no-next-payment') {
    havingConditions = sql`${havingConditions} AND crp.next_payment IS NULL`;
  }
  
  if (scheduledInvoicesFilter === 'has-next-invoice') {
    havingConditions = sql`${havingConditions} AND rec.next_invoice_date IS NOT NULL`;
  } else if (scheduledInvoicesFilter === 'no-next-invoice') {
    havingConditions = sql`${havingConditions} AND rec.next_invoice_date IS NULL`;
  }
  
  if (paymentMatchFilter === 'match') {
    havingConditions = sql`${havingConditions} AND crp.next_payment = rec.next_invoice_date AND (crp.amount * 100)::INTEGER = rec.next_invoice_amount`;
  } else if (paymentMatchFilter === 'mismatch') {
    havingConditions = sql`${havingConditions} AND (
      (crp.next_payment IS NULL AND rec.next_invoice_date IS NOT NULL) OR
      (crp.next_payment IS NOT NULL AND rec.next_invoice_date IS NULL) OR
      (crp.next_payment IS NOT NULL AND rec.next_invoice_date IS NOT NULL AND
       (crp.next_payment != rec.next_invoice_date OR (crp.amount * 100)::INTEGER != rec.next_invoice_amount))
    )`;
  }
  
  try {
    const customers = await sql<CustomerTableData[]>`
    WITH inv AS (
        SELECT 
          customer_id, 
          COALESCE(SUM(amount) FILTER (WHERE date <= CURRENT_DATE), 0) AS sum_invoices,
          MIN(date) FILTER (WHERE date > CURRENT_DATE) AS next_invoice_date,
          MIN(amount) FILTER (WHERE date > CURRENT_DATE) AS next_invoice_amount
        FROM invoices 
        GROUP BY customer_id
        ),
        rec AS (  
          SELECT customer_id, next_invoice_date, day_sum AS next_invoice_amount
          FROM (
            SELECT
              customer_id,
              (next_date)::date                           AS next_invoice_date,
              SUM(amount)                                 AS day_sum,
              ROW_NUMBER() OVER (
                PARTITION BY customer_id
                ORDER BY (next_date)::date ASC
              )                                           AS rn
            FROM recurring_invoices
            GROUP BY customer_id, (next_date)::date
          ) x
          WHERE rn = 1
        ),
        pay AS (
        SELECT
            customer_id,
            COALESCE(SUM(amount) FILTER (WHERE status='submitted'),0) AS sum_payments,
            MIN(date)   FILTER (WHERE status='scheduled') AS next_payment_date,
            MIN(amount) FILTER (WHERE status='scheduled') AS next_payment_amount,
            AVG(amount) FILTER (WHERE status='scheduled') AS regular_payment_amount
        FROM payments GROUP BY customer_id 
        ),
        crp AS (
          SELECT customer_id, amount, next_payment, description
          FROM (
            SELECT
              customer_id,
              amount,
              next_payment,
              description,
              ROW_NUMBER() OVER (
                PARTITION BY customer_id
                ORDER BY next_payment ASC
              ) AS rn
            FROM converge_recurring_payments
            WHERE next_payment >= CURRENT_DATE
              AND LOWER(billing_cycle) != 'suspended'
          ) x
          WHERE rn = 1
        ),
        stu AS (
        SELECT
            student_agg.customer_id,
            COALESCE(
              JSONB_AGG(
                JSONB_BUILD_OBJECT(
                  'id', student_agg.id, 
                  'name', student_agg.name,
                  'has_activity', student_agg.has_activity,
                  'has_upcoming_start', student_agg.has_upcoming_start
                ) ORDER BY student_agg.name
              ),
              '[]'::jsonb
            ) AS students,
            COUNT(*) FILTER (WHERE student_agg.has_activity = true) AS active_students_count
        FROM (
          SELECT
            s.id,
            s.customer_id,
            s.name,
            CASE WHEN (COUNT(e.id) > 0 OR COUNT(p.id) > 0) THEN true ELSE false END AS has_activity,
            CASE WHEN (MIN(e.start_date) FILTER (WHERE e.start_date > CURRENT_DATE) IS NOT NULL) THEN true ELSE false END AS has_upcoming_start
          FROM students s
          LEFT JOIN enrolments e ON e.student_id = s.id
          LEFT JOIN pickups p ON p.student_id = s.id
          GROUP BY s.id, s.customer_id, s.name
        ) student_agg
        GROUP BY student_agg.customer_id
        ),
        latest_customer_note AS (
          SELECT DISTINCT ON (cn.customer_id)
            cn.customer_id,
            JSONB_BUILD_OBJECT(
              'id', cn.id,
              'content', cn.content,
              'date', cn.date,
              'creator', cn.creator
            ) AS recent_note
          FROM customer_notes cn
          ORDER BY cn.customer_id, cn.date DESC
        )
        SELECT
        c.id,
        c.name,
        c.email,
        c.alternate_name,
        c.alternate_email,
        c.set_up_qbo,
        COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0) AS total_due,
        rec.next_invoice_date,
        rec.next_invoice_amount,
        pay.regular_payment_amount,
        crp.amount AS next_recurring_payment_amount,
        crp.next_payment AS next_recurring_payment_date,
        crp.description AS next_recurring_payment_description,
        COALESCE(stu.students, '[]'::jsonb) AS students,
        lcn.recent_note
        FROM customers c
        LEFT JOIN inv ON inv.customer_id = c.id
        LEFT JOIN pay ON pay.customer_id = c.id
        LEFT JOIN stu ON stu.customer_id = c.id
        LEFT JOIN rec ON rec.customer_id = c.id
        LEFT JOIN crp ON crp.customer_id = c.id
        LEFT JOIN latest_customer_note lcn ON lcn.customer_id = c.id
        WHERE ${whereConditions}
          AND (${havingConditions})
        ORDER BY ${sql(sortBy)} DESC
        LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset};
        `
        return customers;

      
    
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customers.');
  }
}

export async function fetchCustomerPages(
  query: string, 
  qboFilter?: string,
  balanceFilter?: string,
  studentsFilter?: string,
  paymentsFilter?: string,
  recurringPaymentsFilter?: string,
  scheduledInvoicesFilter?: string,
  paymentMatchFilter?: string
) {
  try {
    // Build base WHERE conditions - use 'c' alias for consistency
    let whereConditions = sql`(
      c.name ILIKE ${`%${query}%`}
      OR c.email ILIKE ${`%${query}%`}
      OR COALESCE(c.alternate_name, '') ILIKE ${`%${query}%`}
      OR COALESCE(c.alternate_email, '') ILIKE ${`%${query}%`}
    )`;
    
    if (qboFilter === 'setup') {
      whereConditions = sql`${whereConditions} AND c.set_up_qbo = true`;
    } else if (qboFilter === 'not-setup') {
      whereConditions = sql`${whereConditions} AND (c.set_up_qbo = false OR c.set_up_qbo IS NULL)`;
    }
    
    // If we have filters that require aggregation, use a subquery
    if (balanceFilter || studentsFilter || paymentsFilter || recurringPaymentsFilter || scheduledInvoicesFilter || paymentMatchFilter) {
      let havingConditions = sql`TRUE`;
      
      if (balanceFilter === 'has-balance') {
        havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) != 0`;
      } else if (balanceFilter === 'no-balance') {
        havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) = 0`;
      }
      
      if (studentsFilter === 'has-students') {
        havingConditions = sql`${havingConditions} AND JSONB_ARRAY_LENGTH(COALESCE(stu.students, '[]'::jsonb)) > 0`;
      } else if (studentsFilter === 'no-students') {
        havingConditions = sql`${havingConditions} AND JSONB_ARRAY_LENGTH(COALESCE(stu.students, '[]'::jsonb)) = 0`;
      } else if (studentsFilter === 'has-active-students') {
        havingConditions = sql`${havingConditions} AND stu.active_students_count > 0`;
      } else if (studentsFilter === 'no-active-students') {
        havingConditions = sql`${havingConditions} AND (stu.active_students_count = 0 OR stu.active_students_count IS NULL)`;
      }
      
      if (paymentsFilter === 'has-recurring') {
        havingConditions = sql`${havingConditions} AND crp.next_payment IS NOT NULL`;
      } else if (paymentsFilter === 'has-invoices') {
        havingConditions = sql`${havingConditions} AND rec.next_invoice_date IS NOT NULL`;
      } else if (paymentsFilter === 'no-upcoming') {
        havingConditions = sql`${havingConditions} AND crp.next_payment IS NULL AND rec.next_invoice_date IS NULL`;
      }
      
      if (recurringPaymentsFilter === 'has-next-payment') {
        havingConditions = sql`${havingConditions} AND crp.next_payment IS NOT NULL`;
      } else if (recurringPaymentsFilter === 'no-next-payment') {
        havingConditions = sql`${havingConditions} AND crp.next_payment IS NULL`;
      }
      
      if (scheduledInvoicesFilter === 'has-next-invoice') {
        havingConditions = sql`${havingConditions} AND rec.next_invoice_date IS NOT NULL`;
      } else if (scheduledInvoicesFilter === 'no-next-invoice') {
        havingConditions = sql`${havingConditions} AND rec.next_invoice_date IS NULL`;
      }
      
      if (paymentMatchFilter === 'match') {
        havingConditions = sql`${havingConditions} AND crp.next_payment = rec.next_invoice_date AND (crp.amount * 100)::INTEGER = rec.next_invoice_amount`;
      } else if (paymentMatchFilter === 'mismatch') {
        havingConditions = sql`${havingConditions} AND (
          (crp.next_payment IS NULL AND rec.next_invoice_date IS NOT NULL) OR
          (crp.next_payment IS NOT NULL AND rec.next_invoice_date IS NULL) OR
          (crp.next_payment IS NOT NULL AND rec.next_invoice_date IS NOT NULL AND
           (crp.next_payment != rec.next_invoice_date OR (crp.amount * 100)::INTEGER != rec.next_invoice_amount))
        )`;
      }
      
      const data = await sql`
        WITH inv AS (
          SELECT customer_id, COALESCE(SUM(amount), 0) AS sum_invoices
          FROM invoices 
          GROUP BY customer_id
        ),
        pay AS (
          SELECT customer_id, COALESCE(SUM(amount) FILTER (WHERE status='submitted'),0) AS sum_payments
          FROM payments GROUP BY customer_id 
        ),
        crp AS (
          SELECT customer_id, amount, next_payment
          FROM (
            SELECT
              customer_id,
              amount,
              next_payment,
              ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY next_payment ASC) AS rn
            FROM converge_recurring_payments
            WHERE next_payment >= CURRENT_DATE
          ) x
          WHERE rn = 1
        ),
        rec AS (
          SELECT customer_id, next_invoice_date, next_invoice_amount
          FROM (
            SELECT
              customer_id,
              (next_date)::date AS next_invoice_date,
              SUM(amount) AS next_invoice_amount,
              ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY (next_date)::date ASC) AS rn
            FROM recurring_invoices
            GROUP BY customer_id, (next_date)::date
          ) x
          WHERE rn = 1
        ),
        stu AS (
          SELECT
            s.customer_id,
            COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::jsonb) AS students,
            COUNT(*) FILTER (WHERE e.id IS NOT NULL OR p.id IS NOT NULL) AS active_students_count
          FROM students s
          LEFT JOIN enrolments e ON e.student_id = s.id
          LEFT JOIN pickups p ON p.student_id = s.id
          GROUP BY s.customer_id
        )
        SELECT COUNT(DISTINCT c.id)
        FROM customers c
        LEFT JOIN inv ON inv.customer_id = c.id
        LEFT JOIN pay ON pay.customer_id = c.id
        LEFT JOIN stu ON stu.customer_id = c.id
        LEFT JOIN rec ON rec.customer_id = c.id
        LEFT JOIN crp ON crp.customer_id = c.id
        WHERE ${whereConditions}
          AND (${havingConditions})
      `;
      
      const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
      return totalPages;
    }
    
    // Simple query without aggregation filters - use 'c' alias
    const data = await sql`
      SELECT COUNT(*)
      FROM customers c
      WHERE ${whereConditions}
    `;

    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of customers.');
  }
}

export async function fetchUnnassignedStudents(query: string) {
  try {
    const students = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM students
      WHERE customer_id IS NULL AND name ILIKE '%' || ${query} || '%'
      LIMIT ${ITEMS_PER_PAGE}
      ;`
    return students;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch unassigned students.');
  }
}

export async function fetchUnassignedStudentsWithEnrolments() {
  try {
    const students = await sql<{ 
      id: string; 
      name: string;
      enrolments: Array<{
        id: string;
        course_name: string;
        weekday: string;
        start_time: string;
        end_time: string;
      }>;
    }[]>`
      SELECT 
        s.id,
        s.name,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', e.id,
              'course_name', crs.name,
              'weekday', sess.weekday,
              'start_time', sess.start_time,
              'end_time', sess.end_time
            ) ORDER BY sess.weekday, sess.start_time
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::jsonb
        ) AS enrolments
      FROM students s
      INNER JOIN enrolments e ON s.id = e.student_id
      INNER JOIN courses crs ON e.course_id = crs.id
      INNER JOIN sessions sess ON e.session_id = sess.id
      WHERE s.customer_id IS NULL
      GROUP BY s.id, s.name
      ORDER BY s.name;
    `
    return students;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch unassigned students with enrolments.');
  }
}

export async function fetchFilteredStudentsTable(
  query: string,
  currentPage: number,
  sortBy: string,
 
) {
  'use cache'
  cacheTag('studentsnotes')
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  
  try {
    const students = await sql<StudentTableData[]>`
    WITH
    e AS (
      SELECT e.id, e.student_id, e.course_id, e.session_id
      FROM enrolments e
    ),
    ec AS (
      SELECT
        e.student_id,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', e.id,
              'course_name', crs.name,        -- Course.name per your type
              'weekday', sess.weekday,
              'start_time', sess.start_time,
              'end_time', sess.end_time
            )
            ORDER BY crs.name NULLS LAST
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::jsonb
        ) AS enrolled_courses
      FROM e
      LEFT JOIN courses  crs  ON crs.id  = e.course_id
      LEFT JOIN sessions sess ON sess.id = e.session_id
      GROUP BY e.student_id
    ),
    pd AS (
      SELECT
        p.student_id,
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', p.id,
              'weekday', p.weekday,
              'waiver_signed', p.waiver_signed,
              'school_name', p.school_name,
              'teacher_name', p.teacher_name,
              'room_number', p.room_number
            )
            ORDER BY p.weekday
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::jsonb
        ) AS pickup_days
      FROM pickups p
      GROUP BY p.student_id
    ),
    latest_note AS (
      SELECT DISTINCT ON (sn.student_id)
        sn.student_id,
        JSONB_BUILD_OBJECT(
          'id', sn.id,
          'content', sn.content,
          'date', sn.date,
          'creator', sn.creator
        ) AS recent_note
      FROM student_notes sn
      ORDER BY sn.student_id, sn.date DESC, sn.id DESC
    )
    SELECT
      s.id::text                                 AS id,
      s.name                                     AS name,
      c.name                                     AS customer_name,
      COALESCE(ec.enrolled_courses, '[]'::jsonb) AS enrolled_courses,
      COALESCE(pd.pickup_days, '[]'::jsonb)      AS pickup_days,
      ln.recent_note                             AS recent_note
    FROM students s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN ec ON ec.student_id = s.id
    LEFT JOIN pd ON pd.student_id = s.id
    LEFT JOIN latest_note ln ON ln.student_id = s.id
    WHERE s.name ILIKE '%' || ${query} || '%' OR c.name ILIKE '%' || ${query} || '%'
    ORDER BY ${sql(sortBy)} 
    LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset};
  `;    
  

  return students;

  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch students.');
  } 
}

export async function fetchStudentPages(query: string) {
  try {
    const data = await sql`SELECT COUNT(*)
    FROM students s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.name ILIKE '%' || ${query} || '%'
      OR c.name ILIKE '%' || ${query} || '%'
  `;
    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of students.');
  } 
}


export async function fetchCustomerById(customerId: string | "") {
  try { 
    const customers = await sql<CustomerTableData[]>`
    WITH inv AS (
        SELECT customer_id, COALESCE(SUM(amount),0) AS sum_invoices
        FROM invoices GROUP BY customer_id
        ),
        pay AS (
        SELECT
            customer_id,
            COALESCE(SUM(amount) FILTER (WHERE status='submitted'),0) AS sum_payments,
            MIN(date)   FILTER (WHERE status='scheduled') AS next_payment_date,
            MIN(amount) FILTER (WHERE status='scheduled') AS next_payment_amount,
            AVG(amount) FILTER (WHERE status='scheduled') AS regular_payment_amount
        FROM payments GROUP BY customer_id
        ),
        stu AS (
        SELECT
            customer_id,
            COALESCE(
            JSONB_AGG(JSONB_BUILD_OBJECT('id', id, 'name', name) ORDER BY name),
            '[]'::jsonb
            ) AS students
        FROM students
        GROUP BY customer_id
        )
        SELECT
        c.id,
        c.name,
        c.email,
        c.alternate_name,
        c.alternate_email,
        COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0) AS total_due,
        pay.next_payment_date,
        pay.next_payment_amount,
        pay.regular_payment_amount,
        COALESCE(stu.students, '[]'::jsonb) AS students 
        FROM customers c
        LEFT JOIN inv ON inv.customer_id = c.id
        LEFT JOIN pay ON pay.customer_id = c.id
        LEFT JOIN stu ON stu.customer_id = c.id
        WHERE c.id = ${customerId}
        ;`
        return customers[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer by ID.');
  }
}

export async function fetchCustomerStudentsEnrolments(customerId: string) {
  try {
    const result = await sql<Array<{
      student_id: string;
      student_name: string;
      enrolments: Array<{
        course_name: string;
        weekday: string;
        start_time: string;
        end_time: string;
      }>;
      pickups: Array<{
        weekday: string;
        school_name: string;
      }>;
    }>>`
      SELECT 
        s.id AS student_id,
        s.name AS student_name,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'course_name', c.name,
              'weekday', ses.weekday,
              'start_time', ses.start_time,
              'end_time', ses.end_time,
              'start_date', e.start_date
            )
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) AS enrolments,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'weekday', p.weekday,
              'school_name', p.school_name,
              'comment', p.comment
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) AS pickups
      FROM students s
      LEFT JOIN enrolments e ON e.student_id = s.id
      LEFT JOIN courses c ON c.id = e.course_id
      LEFT JOIN sessions ses ON ses.id = e.session_id
      LEFT JOIN pickups p ON p.student_id = s.id
      WHERE s.customer_id = ${customerId}
      GROUP BY s.id, s.name
      ORDER BY s.name
    `;
    
    return result;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer students enrolments.');
  }
}

export async function fetchExpiringCards() {
  try {
    // Fetch cards expiring in the next 60 days
    const result = await sql<Array<{
      recurring_id: string;
      customer_id: string;
      customer_name: string;
      customer_email: string;
      exp_date: string;
      amount: string;
      billing_cycle: string;
      days_until_expiry: number;
      recent_note: {
        content: string;
        date: string;
        creator: string;
      } | null;
    }>>`
      WITH latest_customer_note AS (
        SELECT DISTINCT ON (customer_id)
          customer_id,
          jsonb_build_object(
            'content', content,
            'date', date,
            'creator', creator
          ) AS note_data
        FROM customer_notes
        ORDER BY customer_id, date DESC, id DESC
      )
      SELECT 
        crp.recurring_id,
        crp.customer_id,
        c.name AS customer_name,
        c.email AS customer_email,
        crp.exp_date,
        crp.amount,
        crp.billing_cycle,
        (crp.exp_date - CURRENT_DATE) AS days_until_expiry,
        lcn.note_data AS recent_note
      FROM converge_recurring_payments crp
      JOIN customers c ON c.id = crp.customer_id
      LEFT JOIN latest_customer_note lcn ON lcn.customer_id = c.id
      WHERE crp.exp_date IS NOT NULL
        AND crp.exp_date <= CURRENT_DATE + INTERVAL '60 days'
      ORDER BY crp.exp_date ASC
    `;
    
    return result;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch expiring cards.');
  }
}

export async function fetchCustomerPayments(customerId: string) {
  try {
    const result = await sql<Array<{
      id: string;
      customer_id: string;
      amount: number;
      date: string;
      status: string;
      description: string;
    }>>`
      SELECT id, customer_id, amount, date, status, comment AS description
      FROM payments
      WHERE customer_id = ${customerId}
      ORDER BY date DESC
    `;
    
    return result;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer payments.');
  }
}

export async function fetchCustomerConvergePayments(customerId: string) {
  try {
    const result = await sql<Array<{
      recurring_id: string;
      customer_id: string;
      amount: string;
      billing_cycle: string;
      last_name: string;
      email: string;
      phone: string;
      exp_date: string;
      start_date: string;
      last_payment: string;
      next_payment: string;
      description: string;
    }>>`
      SELECT 
        recurring_id,
        customer_id,
        amount,
        billing_cycle,
        last_name,
        email,
        phone,
        exp_date,
        start_date,
        last_payment,
        next_payment,
        description
      FROM converge_recurring_payments
      WHERE customer_id = ${customerId}
      ORDER BY next_payment DESC NULLS LAST
    `;
    
    return result;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer converge payments.');
  }
}


const Y = (d: Date) => d.toISOString().slice(0, 10); // 'YYYY-MM-DD'

type SessionSlot = {
  weekday: Weekday;
  start_time: string;
  end_time: string;
};

async function fetchSessionSlot(sessionId: string): Promise<SessionSlot> {
  const rows = await sql<SessionSlot[]>`
    SELECT weekday, start_time, end_time
    FROM sessions
    WHERE id = ${sessionId}
    LIMIT 1;
  `;
  if (!rows.length) throw new Error("Session not found");
  return rows[0];
}




// Real attendance status (present/absent/unmarked) for every student in a
// session on a given date, read live from the portal attendance report. The
// local DB only records absences, so it can't tell "present" from "unmarked" —
// this fills that gap to seed the schedule's attendance buttons. Keyed by
// student_id (as string). NOT cached: it's a live portal read and must reflect
// the latest marks. Returns {} on any failure so the UI falls back to the
// local absent flag.
export async function fetchSessionAttendanceMap(
  sessionId: string,
  date?: Date,
): Promise<Record<string, 'present' | 'absent' | 'unmarked'>> {
  try {
    const rows = await sql<{ weekday: Weekday; start_time: string }[]>`
      SELECT weekday, start_time
      FROM sessions
      WHERE id = ${sessionId}
      LIMIT 1;
    `;
    const slot = rows[0];
    if (!slot) return {};

    const targetDate = date ?? nextOccurrenceOf(slot.weekday);
    const target = Y(targetDate);

    const branchId = Number(process.env.ZEBRA_BRANCH_ID ?? 20);
    const raw = await fetchAttendanceReport({ startDate: target, endDate: target, branchId });

    const wantDay = String(slot.weekday).trim().toLowerCase();
    const wantStart = (slot.start_time ?? '').trim().slice(0, 5); // "HH:MM"

    const map: Record<string, 'present' | 'absent' | 'unmarked'> = {};
    for (const r of raw as any[]) {
      const sid = Number(r?.student?.user_id);
      if (!Number.isFinite(sid)) continue;
      if (String(r?.batch?.day ?? '').trim().toLowerCase() !== wantDay) continue;
      if (String(r?.batch?.start_time ?? '').trim().slice(0, 5) !== wantStart) continue;

      const label = String(r?.attendance_value ?? '').trim();
      // Key by the integer id. students.id is numeric in the DB and serializes
      // as "15876.00", so the caller normalizes its lookup the same way.
      map[String(sid)] =
        label === 'Present'
          ? 'present'
          : label === '' || label === 'Unmarked'
            ? 'unmarked'
            : 'absent';
    }
    return map;
  } catch (error) {
    console.error('fetchSessionAttendanceMap failed:', error);
    return {};
  }
}

export async function fetchSessionStudents(sessionId: string, date?: Date) {
  'use cache'
  
  try {
    
    cacheTag('schedule')
    cacheTag('studentsnotes')
    // If no date provided, compute the next occurrence of this session's weekday
    const slot = await fetchSessionSlot(sessionId);
    let targetDate = date;
    
    if (!targetDate) {
      targetDate = nextOccurrenceOf(slot.weekday);
    }

    const target = Y(targetDate);
    // Compare an enrolment's end date against the start of the schedule week, not
    // the specific class day: an enrolment whose end date falls anywhere in this
    // week (e.g. an arbitrary completion date set on the student page) should
    // still appear for the whole week, and only drop off from the next week on.
    const weekStart = Y(startOfScheduleWeek(targetDate));

    // Join absences ON the specific date and project a boolean
    const students = await sql<ScheduleRow[]>`
      WITH latest_note AS (
        SELECT DISTINCT ON (sn.student_id)
          sn.student_id,
          sn.id,
          sn.content,
          sn.date,
          sn.creator
        FROM student_notes sn
        ORDER BY sn.student_id, sn.date DESC, sn.id DESC
      )
      SELECT
        e.id AS enrolment_id,
        s.name,
        s.id as student_id,
        crs.name AS course_name,
        c.name AS parent_name,
        (abs.enrolment_id IS NOT NULL) AS absent,
        CASE 
          WHEN ln.id IS NOT NULL THEN json_build_object(
            'id', ln.id,
            'content', ln.content,
            'date', ln.date,
            'creator', ln.creator
          )
          ELSE NULL
        END AS recent_note
      FROM students s
      JOIN enrolments e ON e.student_id = s.id
      JOIN sessions sess ON sess.id = e.session_id
      JOIN courses crs ON crs.id = e.course_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN absences abs
        ON abs.enrolment_id = e.id
       AND abs.date = ${target}::date
      LEFT JOIN latest_note ln ON ln.student_id = s.id
      -- A queued (not-yet-fired) inactivation gives the enrolment an effective
      -- end date before the portal scrape sets e.end_date. Linked by student +
      -- class slot since enrolments store no portal id.
      LEFT JOIN future_inactivations fi
        ON fi.student_id = e.student_id
       AND fi.class_day = sess.weekday
       AND LEFT(fi.class_start_time, 5) = LEFT(sess.start_time::text, 5)
      WHERE sess.weekday = ${slot.weekday}
        AND sess.start_time = ${slot.start_time}::time
        AND sess.end_time = ${slot.end_time}::time
        AND (e.start_date IS NULL OR e.start_date <= ${target}::date)
        AND (
          COALESCE(e.end_date, fi.end_date) IS NULL
          OR COALESCE(e.end_date, fi.end_date) >= ${weekStart}::date
        )
      ORDER BY s.name;
    `;

    return students;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch session students.');
  } 
}

export async function fetchUpcomingSessionMakeups(sessionId: string, date?: Date){
  'use cache'
  try{
    
  cacheTag('schedule')
  cacheTag('studentsnotes')
  const slot = await fetchSessionSlot(sessionId);
  let targetDate = date;
    
    if (!targetDate) {
      targetDate = nextOccurrenceOf(slot.weekday);
    }

  const target = Y(targetDate);

  const students = await sql<MakeupRow[]>`
    WITH latest_note AS (
      SELECT DISTINCT ON (sn.student_id)
        sn.student_id,
        sn.id,
        sn.content,
        sn.date,
        sn.creator
      FROM student_notes sn
      ORDER BY sn.student_id, sn.date DESC, sn.id DESC
    )
    SELECT 
      m.id AS makeup_id, 
      s.name, 
      s.id as student_id, 
      crs.name AS course_name,
      c.name AS parent_name,
      m.date,
      CASE 
        WHEN ln.id IS NOT NULL THEN json_build_object(
          'id', ln.id,
          'content', ln.content,
          'date', ln.date,
          'creator', ln.creator
        )
        ELSE NULL
      END AS recent_note
    FROM students s
    JOIN makeups m ON m.student_id = s.id
    JOIN sessions sess ON sess.id = m.session_id
    JOIN courses crs ON crs.id = m.course_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN latest_note ln ON ln.student_id = s.id
    WHERE sess.weekday = ${slot.weekday}
      AND sess.start_time = ${slot.start_time}::time
      AND sess.end_time = ${slot.end_time}::time
      AND m.date = ${target}
      AND (m.cancelled = false OR m.cancelled IS NULL)
    ORDER BY m.date;
  `;
  return students;
  } catch (error){
    throw new Error ('Failed to fetch makeups');
  }
}

export async function fetchUpcomingSessionTrials(sessionId: string, date?: Date){
  'use cache'
  try{  
  cacheTag('schedule')
  cacheTag('studentsnotes')

  const slot = await fetchSessionSlot(sessionId);
  let targetDate = date;
    
    if (!targetDate) {
      targetDate = nextOccurrenceOf(slot.weekday);
    }

    const target = Y(targetDate);

  const students = await sql<TrialRow[]>`
    WITH latest_trial_note AS (
      SELECT DISTINCT ON (tn.trial_id)
        tn.trial_id,
        JSONB_BUILD_OBJECT(
          'id', tn.id,
          'content', tn.content,
          'date', tn.date,
          'creator', tn.creator
        ) AS recent_note
      FROM trial_notes tn
      ORDER BY tn.trial_id, tn.date DESC, tn.id DESC
    )
    SELECT t.id AS trial_id, t.name, crs.name AS course_name, t.date, ltn.recent_note
    FROM trials t
    JOIN sessions sess ON sess.id = t.session_id
    JOIN courses crs ON crs.id = t.course_id
    LEFT JOIN latest_trial_note ltn ON ltn.trial_id = t.id
    WHERE sess.weekday = ${slot.weekday}
      AND sess.start_time = ${slot.start_time}::time
      AND sess.end_time = ${slot.end_time}::time
      AND t.date = ${target}
    ORDER BY t.date;
  `;
  return students;
  } catch (error){
    throw new Error ('Failed to fetch trials');
  }
}

export async function fetchSessionsForDay(
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday',
  date?: Date,
) {
  'use cache'
  
  try {
        // Calculate target date if not provided
        let targetDate = date;
        if (!targetDate) {
          targetDate = nextOccurrenceOf(day);
        }
        const target = Y(targetDate);
        // See fetchSessionStudents: an enrolment ending mid-week still counts for
        // the whole week, so the count badge matches the roster shown.
        const weekStart = Y(startOfScheduleWeek(targetDate));

        const sessions = await sql<Session[]>`
          WITH session_counts AS (
            SELECT
              s.id::text AS id,
              s.weekday,
              s.start_time,
              s.end_time,
              s.is_summer,
              COALESCE(ec.student_count, 0)::int AS student_count,
              COALESCE(mc.makeup_count, 0)::int  AS makeup_count,
              COALESCE(tc.trial_count, 0)::int   AS trial_count,
              COALESCE(ac.absence_count, 0)::int AS absences
            FROM sessions s
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS student_count
              FROM enrolments e
              LEFT JOIN future_inactivations fi
                ON fi.student_id = e.student_id
               AND fi.class_day = s.weekday
               AND LEFT(fi.class_start_time, 5) = LEFT(s.start_time::text, 5)
              WHERE e.session_id = s.id
                AND (e.start_date IS NULL OR e.start_date <= ${target}::date)
                AND (
                  COALESCE(e.end_date, fi.end_date) IS NULL
                  OR COALESCE(e.end_date, fi.end_date) >= ${weekStart}::date
                )
            ) ec ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS makeup_count
              FROM makeups m
              WHERE m.session_id = s.id
                AND m.date = ${target}
            ) mc ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS trial_count
              FROM trials t
              WHERE t.session_id = s.id
                AND t.date = ${target}
            ) tc ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS absence_count
              FROM absences a
              JOIN enrolments e ON e.id = a.enrolment_id
              LEFT JOIN future_inactivations fi
                ON fi.student_id = e.student_id
               AND fi.class_day = s.weekday
               AND LEFT(fi.class_start_time, 5) = LEFT(s.start_time::text, 5)
              WHERE e.session_id = s.id
                AND a.date = ${target}
                AND (e.start_date IS NULL OR e.start_date <= ${target}::date)
                AND (
                  COALESCE(e.end_date, fi.end_date) IS NULL
                  OR COALESCE(e.end_date, fi.end_date) >= ${weekStart}::date
                )
            ) ac ON true
            WHERE s.weekday = ${day}
          ),
          visible_session_counts AS (
            SELECT *
            FROM session_counts
            WHERE student_count > 0
              OR makeup_count > 0
              OR trial_count > 0
          )
          SELECT
            (ARRAY_AGG(id ORDER BY is_summer, id))[1] AS id,
            ARRAY_AGG(id ORDER BY is_summer, id) AS session_ids,
            weekday,
            start_time,
            end_time,
            SUM(student_count)::int AS student_count,
            SUM(makeup_count)::int AS makeup_count,
            SUM(trial_count)::int AS trial_count,
            SUM(absences)::int AS absences
          FROM visible_session_counts
          GROUP BY weekday, start_time, end_time
          ORDER BY start_time, end_time;
        `;
        return sessions;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch sessions for day.');
  } 
}

export async function fetchCustomersList(query: string) {

  try {
    const customers = await sql<CustomerTableData[]>`
      SELECT id, name, email, alternate_name, alternate_email
      FROM customers
      WHERE name ILIKE '%' || ${query} || '%'
        OR email ILIKE '%' || ${query} || '%'
        OR COALESCE(alternate_name, '') ILIKE '%' || ${query} || '%'
        OR COALESCE(alternate_email, '') ILIKE '%' || ${query} || '%'
      ORDER BY name
      LIMIT 200
    ;`;
    return customers;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customers list.');
  } 
}

export async function fetchRecurringInvoicesByCustomer(customerId: string){
  try {
    const recurring = await sql<RecurringInvoiceListData[]>`
      SELECT id, amount, every, day_of_month, next_date, start_date, end_after, description
      FROM recurring_invoices r
      WHERE customer_id = ${customerId}
      ORDER BY next_date;
    `

   
    return recurring;
  }catch (error){
    console.error('Database Error: ', error);
    throw new Error('Failed to fetch recurring invoices for customer.')
  }
}

export async function fetchRecurringInvoiceById(invoiceId: string){
  try {
    const recurring = await sql<RecurringInvoice[]>`  
      SELECT id, customer_id, amount, every, day_of_month, start_date, next_date, end_after, description
      FROM recurring_invoices
      WHERE id = ${invoiceId}
      LIMIT 1;
    `
    return recurring[0];
  }catch (error){
    console.error('Database Error: ', error);
    throw new Error('Failed to fetch recurring invoice by ID.')
  }
}

export async function fetchPickupsForDay(day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday', school?: string, date?: Date){
  try {
    const weekday = day.toLowerCase()
    const school_name = school?.toLowerCase();

    let targetDate = date;
    if (!targetDate) {
      targetDate = nextOccurrenceOf(day);
    }


    const target = Y(targetDate);


    const pickups = await sql<PickupListDisplay[]>`
      WITH latest_note AS (
        SELECT DISTINCT ON (sn.student_id)
          sn.student_id,
          sn.id,
          sn.content,
          sn.date,
          sn.creator
        FROM student_notes sn
        ORDER BY sn.student_id, sn.date DESC, sn.id DESC
      )
      SELECT 
        p.*, 
        s.name AS name, 
        CASE WHEN pa.id IS NOT NULL THEN true ELSE false END AS absent,
        CASE 
          WHEN ln.id IS NOT NULL THEN json_build_object(
            'id', ln.id,
            'content', ln.content,
            'date', ln.date,
            'creator', ln.creator
          )
          ELSE NULL
        END AS recent_note
      FROM pickups p
      LEFT JOIN students s ON p.student_id = s.id
      LEFT JOIN pickup_absences pa ON p.id = pa.pickup_id AND pa.date = ${target}
      LEFT JOIN latest_note ln ON ln.student_id = s.id
      WHERE p.weekday = ${weekday} AND p.school_name=${school_name??'frankland'}
      ORDER BY p.school_name, s.name;
    `
    return pickups;
  }catch(error){
    console.error('Database Error:', error);
    throw new Error('Failed to fetch session students.');
  }

}

export async function fetchPickupAbsencesForStudent(studentId: string) {
  try {
    const absences = await sql<{
      id: string;
      pickup_id: string;
      date: Date;
      weekday: string;
      school_name: string;
    }[]>`
      SELECT 
        pa.id,
        pa.pickup_id,
        pa.date,
        p.weekday,
        p.school_name
      FROM pickup_absences pa
      JOIN pickups p ON p.id = pa.pickup_id
      WHERE p.student_id = ${studentId}
      ORDER BY pa.date DESC;
    `;
    return absences;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch pickup absences.');
  }
}

export async function fetchSlipInfoById(userId: string) {
  try {

    console.log('Fetching slip info for user ID:', userId);
    const slip = await sql<SlipInfo[]>` 
      SELECT
        id,
        student_name,
        user_id,
        lms_username,
        lms_password, 
        course_name,
        other_fields  
      FROM slip_info
      WHERE user_id = ${userId};
    `
    return slip;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch slip info by ID.');
  }
}

export async function fetchFilteredEnrolments(query: string) {
  try {
    const enrolments = await sql<{
      student_name: string;
      enrolment_id: string;
      student_id: string;
      course_name: string;
      other_fields: { [key: string]: string } | null;
    }[]>`
      SELECT 
        e.id AS enrolment_id,
        s.name AS student_name,
        s.id AS student_id,
        c.name AS course_name,
        JSONB_STRIP_NULLS(
          JSONB_BUILD_OBJECT(
            'Scratch Login', scr.username,
            'Scratch Password', scr.password,
            'Roblox Login', rob.username,
            'Roblox Password', rob.password,
            'Laptop #', lap.laptop_number
          )
        ) AS other_fields
      FROM enrolments e
      JOIN students s ON s.id = e.student_id
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN scratch_accounts scr ON scr.student_id = s.id
      LEFT JOIN roblox_accounts rob ON rob.student_id = s.id
      LEFT JOIN laptop_assignments lap ON lap.student_id = s.id
      WHERE 
        s.name ILIKE ${`%${query}%`}

      ORDER BY s.name
      LIMIT 20;
    `;
    return enrolments;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch filtered enrolments.');
  }
}

export async function fetchAllAccountsManagement(query: string, unassignedOnly: boolean, currentPage: number = 1) {
  try {
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const accounts = await sql<{
      username: string;
      password: string;
      student_id: string | null;
      student_name: string | null;
      account_type: string;
    }[]>`
      SELECT 
        scr.username,
        scr.password,
        scr.student_id,
        s.name AS student_name,
        'scratch' AS account_type
      FROM scratch_accounts scr
      LEFT JOIN students s ON s.id = scr.student_id
      WHERE 
        (scr.username ILIKE ${`%${query}%`}
        OR 'scratch' ILIKE ${`%${query}%`}
        OR s.name ILIKE ${`%${query}%`})
        ${unassignedOnly ? sql`AND scr.student_id IS NULL` : sql``}
      
      UNION ALL
      
      SELECT 
        rob.username,
        rob.password,
        rob.student_id,
        s.name AS student_name,
        'roblox' AS account_type
      FROM roblox_accounts rob
      LEFT JOIN students s ON s.id = rob.student_id
      WHERE 
        (rob.username ILIKE ${`%${query}%`}
        OR 'roblox' ILIKE ${`%${query}%`}
        OR s.name ILIKE ${`%${query}%`})
        ${unassignedOnly ? sql`AND rob.student_id IS NULL` : sql``}
      
      UNION ALL
      
      SELECT 
        lap.laptop_number AS username,
        '' AS password,
        lap.student_id,
        s.name AS student_name,
        'laptop' AS account_type
      FROM laptop_assignments lap
      LEFT JOIN students s ON s.id = lap.student_id
      WHERE 
        (lap.laptop_number ILIKE ${`%${query}%`}
        OR 'laptop' ILIKE ${`%${query}%`}
        OR s.name ILIKE ${`%${query}%`})
        ${unassignedOnly ? sql`AND lap.student_id IS NULL` : sql``}
      
      ORDER BY account_type, username
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset};
    `;
    return accounts;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch accounts.');
  }
}

export async function fetchAccountsManagementPages(query: string, unassignedOnly: boolean) {
  try {
    const data = await sql<{ count: number }[]>`
      SELECT COUNT(*) FROM (
        SELECT username FROM scratch_accounts scr
        LEFT JOIN students s ON s.id = scr.student_id
        WHERE 
          (scr.username ILIKE ${`%${query}%`}
          OR 'scratch' ILIKE ${`%${query}%`}
          OR s.name ILIKE ${`%${query}%`})
          ${unassignedOnly ? sql`AND scr.student_id IS NULL` : sql``}
        
        UNION ALL
        
        SELECT username FROM roblox_accounts rob
        LEFT JOIN students s ON s.id = rob.student_id
        WHERE 
          (rob.username ILIKE ${`%${query}%`}
          OR 'roblox' ILIKE ${`%${query}%`}
          OR s.name ILIKE ${`%${query}%`})
          ${unassignedOnly ? sql`AND rob.student_id IS NULL` : sql``}
        
        UNION ALL
        
        SELECT laptop_number AS username FROM laptop_assignments lap
        LEFT JOIN students s ON s.id = lap.student_id
        WHERE 
          (lap.laptop_number ILIKE ${`%${query}%`}
          OR 'laptop' ILIKE ${`%${query}%`}
          OR s.name ILIKE ${`%${query}%`})
          ${unassignedOnly ? sql`AND lap.student_id IS NULL` : sql``}
      ) AS combined;
    `;

    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch accounts page count.');
  }
}

export async function fetchStudentsForAssignment(query: string) {
  try {
    console.log('Fetching students for assignment with query:', query);
    const students = await sql<{
      id: string;
      name: string;
    }[]>`
      SELECT 
        id,
        name
      FROM students
      WHERE 
        name ILIKE ${`%${query}%`}
        OR id::text ILIKE ${`%${query}%`}
      ORDER BY name
      LIMIT 20;
    `;
    return students;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch students for assignment.');
  }
}

// Minimal student record for the edit page header (name + assigned customer).
export async function fetchStudentName(id: string) {
  try {
    const rows = await sql<{ id: string; name: string; customer_name: string | null }[]>`
      SELECT s.id::text AS id, s.name, c.name AS customer_name
      FROM students s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = ${id}
      LIMIT 1;
    `;
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch student.');
  }
}

export async function fetchStudentNotes(studentId: string) {
  try {
    const notes = await sql<StudentNote[]>`
      SELECT 
        id,
        student_id,
        content,
        date,
        creator
      FROM student_notes
      WHERE student_id = ${studentId}
      ORDER BY date DESC;
    `;
    return notes;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch student notes.');
  }
}

export async function fetchCustomerNotes(customerId: string) {
  if (!customerId || !customerId.trim()) {
    return [];
  }

  try {
    const notes = await sql<CustomerNote[]>`
      SELECT 
        id,
        customer_id,
        content,
        date,
        creator
      FROM customer_notes
      WHERE customer_id = ${customerId}
      ORDER BY date DESC;
    `;
    return notes;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer notes.');
  }
}

export type SummerResponseLatestNotes = {
  studentNotes: {
    student_id: string;
    student_note_id: string | null;
    student_note: string | null;
    student_note_date: Date | null;
    student_note_creator: string | null;
  }[];
  customerNotes: {
    customer_id: string;
    customer_note_id: string | null;
    customer_note: string | null;
    customer_note_date: Date | null;
    customer_note_creator: string | null;
  }[];
};

export async function fetchLatestSummerResponseNotes(
  studentIds: string[],
  customerIds: string[],
): Promise<SummerResponseLatestNotes> {
  const uniqueStudentIds = Array.from(new Set(studentIds.filter(Boolean)));
  const uniqueCustomerIds = Array.from(new Set(customerIds.filter(Boolean)));

  try {
    const [studentNotes, customerNotes] = await Promise.all([
      uniqueStudentIds.length > 0
        ? sql<SummerResponseLatestNotes['studentNotes']>`
            SELECT DISTINCT ON (sn.student_id)
              sn.student_id::text AS student_id,
              sn.id::text AS student_note_id,
              sn.content AS student_note,
              sn.date AS student_note_date,
              sn.creator AS student_note_creator
            FROM student_notes sn
            WHERE sn.student_id::text = ANY(${uniqueStudentIds}::text[])
            ORDER BY sn.student_id, sn.date DESC, sn.id DESC
          `
        : Promise.resolve([]),
      uniqueCustomerIds.length > 0
        ? sql<SummerResponseLatestNotes['customerNotes']>`
            SELECT DISTINCT ON (cn.customer_id)
              cn.customer_id::text AS customer_id,
              cn.id::text AS customer_note_id,
              cn.content AS customer_note,
              cn.date AS customer_note_date,
              cn.creator AS customer_note_creator
            FROM customer_notes cn
            WHERE cn.customer_id::text = ANY(${uniqueCustomerIds}::text[])
            ORDER BY cn.customer_id, cn.date DESC, cn.id DESC
          `
        : Promise.resolve([]),
    ]);

    return { studentNotes, customerNotes };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch summer response notes.');
  }
}

export async function fetchTrialNotes(trialId: string) {
  try {
    const notes = await sql<TrialNote[]>`
      SELECT 
        id,
        trial_id,
        content,
        date,
        creator
      FROM trial_notes
      WHERE trial_id = ${trialId}
      ORDER BY date DESC;
    `;
    return notes;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch trial notes.');
  }
}

export async function fetchTodaySummary(date?: Date) {
  'use cache'
  try {
    cacheTag('schedule')
    
    const today = date || new Date();
    const weekday = WEEKDAYS[today.getDay()];
    const target = Y(today);

    // Get all sessions for today with detailed lists
    const sessions = await sql<(Session & {
      absent_students?: { name: string; course: string }[];
      trial_students?: { name: string; course: string }[];
      makeup_students?: { name: string; course: string }[];
    })[]>`
      SELECT
        s.id,
        s.weekday,
        s.start_time,
        s.end_time,
        COALESCE(ec.student_count, 0)::int AS student_count,
        COALESCE(mc.makeup_count, 0)::int  AS makeup_count,
        COALESCE(tc.trial_count, 0)::int   AS trial_count,
        COALESCE(ac.absence_count, 0)::int AS absences,
        COALESCE(absent_list.students, '[]'::json) AS absent_students,
        COALESCE(trial_list.students, '[]'::json) AS trial_students,
        COALESCE(makeup_list.students, '[]'::json) AS makeup_students
      FROM sessions s
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS student_count
        FROM enrolments e
        WHERE e.session_id = s.id
      ) ec ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS makeup_count
        FROM makeups m
        WHERE m.session_id = s.id
          AND m.date = ${target}
      ) mc ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS trial_count
        FROM trials t
        WHERE t.session_id = s.id
          AND t.date = ${target}
      ) tc ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS absence_count
        FROM absences a
        JOIN enrolments e ON e.id = a.enrolment_id
        WHERE e.session_id = s.id
          AND a.date = ${target}
      ) ac ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('name', st.name, 'course', c.name)) AS students
        FROM absences a
        JOIN enrolments e ON e.id = a.enrolment_id
        JOIN students st ON st.id = e.student_id
        JOIN courses c ON c.id = e.course_id
        WHERE e.session_id = s.id AND a.date = ${target}
      ) absent_list ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('name', t.name, 'course', c.name)) AS students
        FROM trials t
        JOIN courses c ON c.id = t.course_id
        WHERE t.session_id = s.id AND t.date = ${target}
      ) trial_list ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('name', st.name, 'course', c.name)) AS students
        FROM makeups m
        JOIN students st ON st.id = m.student_id
        JOIN courses c ON c.id = m.course_id
        WHERE m.session_id = s.id AND m.date = ${target}
      ) makeup_list ON true
      WHERE s.weekday = ${weekday}
        AND s.is_summer = FALSE
      ORDER BY s.start_time;
    `;

    // Get pickups for today
    const pickups = await sql<PickupListDisplay[]>`
      WITH latest_note AS (
        SELECT DISTINCT ON (sn.student_id)
          sn.student_id,
          sn.id,
          sn.content,
          sn.date,
          sn.creator
        FROM student_notes sn
        ORDER BY sn.student_id, sn.date DESC, sn.id DESC
      )
      SELECT 
        p.*, 
        s.name AS name, 
        CASE WHEN pa.id IS NOT NULL THEN true ELSE false END AS absent,
        CASE 
          WHEN ln.id IS NOT NULL THEN json_build_object(
            'id', ln.id,
            'content', ln.content,
            'date', ln.date,
            'creator', ln.creator
          )
          ELSE NULL
        END AS recent_note
      FROM pickups p
      JOIN students s ON s.id = p.student_id
      LEFT JOIN pickup_absences pa ON pa.pickup_id = p.id AND pa.date = ${target}
      LEFT JOIN latest_note ln ON ln.student_id = s.id
      WHERE LOWER(p.weekday) = ${weekday.toLowerCase()}
      ORDER BY p.school_name, s.name;
    `;

    // Calculate totals - ensure they're numbers
    const totalStudents = sessions.reduce((sum, s) => sum + Number(s.student_count || 0), 0);
    const totalAbsences = sessions.reduce((sum, s) => sum + Number(s.absences || 0), 0);
    const totalTrials = sessions.reduce((sum, s) => sum + Number(s.trial_count || 0), 0);
    const totalMakeups = sessions.reduce((sum, s) => sum + Number(s.makeup_count || 0), 0);

    console.log('fetchTodaySummary debug:', {
      target,
      weekday,
      sessionsCount: sessions.length,
      firstSession: sessions[0] ? {
        id: sessions[0].id,
        time: `${sessions[0].start_time}-${sessions[0].end_time}`,
        absences: sessions[0].absences,
        absent_students: sessions[0].absent_students,
        trial_students: sessions[0].trial_students,
        makeup_students: sessions[0].makeup_students,
      } : null
    });

    const totals = {
      totalSessions: sessions.length,
      totalStudents,
      totalAbsences,
      totalTrials,
      totalMakeups,
      totalPickups: pickups.length,
      pickupAbsences: pickups.filter(p => p.absent).length,
    };

    return {
      sessions,
      pickups,
      totals,
      weekday,
      date: today,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch today summary.');
  }
}

export async function fetchCustomerInvoices(customerId: string) {
  'use cache'
  try {
    cacheTag('invoices');
    const invoices = await sql<InvoiceTableData[]>`
      SELECT
        id,
        amount,
        date,
        description
      FROM invoices
      WHERE customer_id = ${customerId}
      ORDER BY date DESC;
    `;
    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer invoices.');
  }
}

export async function fetchInvoiceDiscrepancies() {
  'use cache'
  cacheTag('invoices');
  cacheTag('customers');
  try {
    // Calculate expected monthly fees for each customer based on active enrollments and pickups
    const discrepancies = await sql<{
      customer_id: string;
      customer_name: string;
      expected_amount: number;
      expected_enrollment_cost: number;
      expected_pickup_cost: number;
      enrollment_count: number;
      pickup_count: number;
      recurring_invoice_id: string | null;
      recurring_invoice_amount: number | null;
      recurring_invoice_description: string | null;
      difference: number | null;
    }[]>
    `
      WITH customer_students AS (
        SELECT 
          c.id as customer_id,
          c.name as customer_name,
          s.id as student_id
        FROM customers c
        LEFT JOIN students s ON s.customer_id = c.id
      ),
       enrollment_costs AS (
        SELECT 
          cs.customer_id,
          cs.customer_name,
          COALESCE(SUM(co.price), 0) as expected_enrollment_cost,
          COUNT(DISTINCT e.id) as enrollment_count
        FROM customer_students cs
        LEFT JOIN enrolments e ON e.student_id = cs.student_id
        LEFT JOIN courses co ON co.id = e.course_id
        GROUP BY cs.customer_id, cs.customer_name
      ),
      pickup_costs AS (
        SELECT 
          cs.customer_id,
          COUNT(DISTINCT (cs.student_id, p.weekday)) FILTER (WHERE p.id IS NOT NULL) * 40 as expected_pickup_cost,
          COUNT(DISTINCT (cs.student_id, p.weekday)) FILTER (WHERE p.id IS NOT NULL) as pickup_count
        FROM customer_students cs
        LEFT JOIN pickups p ON p.student_id = cs.student_id
        GROUP BY cs.customer_id
      ),
      recurring_invoices_monthly AS (
        SELECT 
          customer_id,
          id as recurring_invoice_id,
          amount as recurring_invoice_amount,
          description as recurring_invoice_description,
          ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY start_date DESC) as rn
        FROM recurring_invoices
        WHERE description LIKE 'Monthly fee%'
      )
        SELECT 
        ec.customer_id,
        ec.customer_name,
        (COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) * 100 as expected_amount,
        ec.expected_enrollment_cost,
        COALESCE(pc.expected_pickup_cost, 0) as expected_pickup_cost,
        COALESCE(ec.enrollment_count, 0) as enrollment_count,
        COALESCE(pc.pickup_count, 0) as pickup_count,
        ri.recurring_invoice_id,
        ri.recurring_invoice_amount,
        ri.recurring_invoice_description,
        CASE 
          WHEN ri.recurring_invoice_amount IS NOT NULL 
          THEN ri.recurring_invoice_amount - ((COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) * 100)
          ELSE NULL
        END as difference
      FROM enrollment_costs ec
      LEFT JOIN pickup_costs pc ON ec.customer_id = pc.customer_id
      LEFT JOIN recurring_invoices_monthly ri ON ec.customer_id = ri.customer_id AND ri.rn = 1
      WHERE 
        -- Only show customers with enrollments or pickups
        (COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) > 0
        AND (
          -- Has no recurring invoice
          ri.recurring_invoice_id IS NULL
          -- OR has recurring invoice with different amount
          OR ri.recurring_invoice_amount != ((COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) * 100)
        )
      ORDER BY ec.customer_name;
    `;
    
    return discrepancies;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice discrepancies.');
  }
}

// Camp functions
type CampRosterColumnFlags = {
  note: boolean;
  parent_name: boolean;
  parent_phone: boolean;
  allergies: boolean;
};

async function campEnrolmentsRosterColumns(): Promise<CampRosterColumnFlags> {
  const columns = await sql<{ column_name: keyof CampRosterColumnFlags }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'camp_enrolments'
      AND column_name IN ('note', 'parent_name', 'parent_phone', 'allergies');
  `;
  const names = new Set(columns.map((column) => column.column_name));

  return {
    note: names.has('note'),
    parent_name: names.has('parent_name'),
    parent_phone: names.has('parent_phone'),
    allergies: names.has('allergies'),
  };
}

async function campPrintStudentListOverridesReady() {
  const [schema] = await sql<{ ready: boolean }[]>`
    SELECT to_regclass('public.camp_print_student_list_overrides') IS NOT NULL AS ready;
  `;

  return Boolean(schema?.ready);
}

export async function fetchUpcomingCampSessions() {
  'use cache'
  cacheTag('camps');
  try {
    const sessions = await sql<Array<{
      start_date: Date;
      end_date: Date;
      total_enrolments: number;
      has_extended_care: boolean;
      session_types: string;
      fd_count: number;
      am_count: number;
      pm_count: number;
      extended_care_count: number;
    }>>`
      SELECT 
        cs.start_date,
        cs.end_date,
        COUNT(ce.id)::int as total_enrolments,
        BOOL_OR(cs.extended_care) as has_extended_care,
        STRING_AGG(DISTINCT cs.camp_type, ',') as session_types,
        COUNT(CASE WHEN cs.camp_type = 'FD' THEN ce.id END)::int as fd_count,
        COUNT(CASE WHEN cs.camp_type = 'AM' THEN ce.id END)::int as am_count,
        COUNT(CASE WHEN cs.camp_type = 'PM' THEN ce.id END)::int as pm_count,
        COUNT(CASE WHEN cs.extended_care = true THEN ce.id END)::int as extended_care_count
      FROM camp_sessions cs
      LEFT JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
      WHERE cs.start_date >= DATE_TRUNC('week', CURRENT_DATE)::date
      GROUP BY cs.start_date, cs.end_date
      ORDER BY cs.start_date ASC;
    `;
    return sessions;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch upcoming camp sessions.');
  }
}

export async function fetchUpcomingCampSessionsWithEnrolments() {
  'use cache'
  cacheTag('camps');
  try {
    const rosterColumns = await campEnrolmentsRosterColumns();
    const noteExpression = rosterColumns.note ? sql`ce.note` : sql`NULL::text`;
    const parentNameExpression = rosterColumns.parent_name
      ? sql`COALESCE(NULLIF(ce.parent_name, ''), cust.name)`
      : sql`cust.name`;
    const parentPhoneExpression = rosterColumns.parent_phone
      ? sql`NULLIF(ce.parent_phone, '')`
      : sql`NULL::text`;
    const allergiesExpression = rosterColumns.allergies
      ? sql`NULLIF(ce.allergies, '')`
      : sql`NULL::text`;
    const sessions = await sql<Array<{
      start_date: Date;
      end_date: Date;
      enrolments: Array<{
        id: string;
        student_id: string;
        student_name: string;
        dob: Date | null;
        course_id: string | null;
        course_name: string | null;
        camp_type: 'FD' | 'PM' | 'AM';
        assigned_seat_number: number | null;
        note: string | null;
        special_needs: string | null;
        allergies: string | null;
        extended_care: boolean;
        parent_name: string | null;
        parent_phone: string | null;
        parent_request_notes: string | null;
      }>;
    }>>`
      SELECT 
        cs.start_date,
        cs.end_date,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', ce.id,
            'student_id', ce.student_id,
            'student_name', s.name,
            'dob', s.dob,
            'course_id', ce.course_id,
            'course_name', co.name,
            'camp_type', cs.camp_type,
            'assigned_seat_number', ce.assigned_seat_number,
            'note', ${noteExpression},
            'special_needs', s.special_needs,
            'allergies', ${allergiesExpression},
            'extended_care', cs.extended_care,
            'parent_name', ${parentNameExpression},
            'parent_phone', ${parentPhoneExpression},
            'parent_request_notes', prn.notes
          ) ORDER BY ce.assigned_seat_number NULLS LAST, s.name ASC
        ) FILTER (WHERE ce.id IS NOT NULL) AS enrolments
      FROM camp_sessions cs
      LEFT JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
      LEFT JOIN students s ON s.id = ce.student_id
      LEFT JOIN customers cust ON cust.id = s.customer_id
      LEFT JOIN courses co ON co.id = ce.course_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN NULLIF(pr.custom_notes, '') IS NOT NULL THEN 'Summer: ' || pr.custom_notes END,
            CASE WHEN NULLIF(pr.payload->>'fall_notes', '') IS NOT NULL THEN 'Fall: ' || (pr.payload->>'fall_notes') END,
            CASE WHEN pr.status = 'needs_manual_followup' THEN 'Needs follow-up' END
          ], NULL),
          E'\n'
        ) AS notes
        FROM parent_requests pr
        WHERE pr.student_id = s.id
          AND pr.is_latest = TRUE
          AND pr.removed_at IS NULL
          AND pr.request_type IN ('summer_scheduling', 'other')
        ORDER BY pr.submitted_at DESC
        LIMIT 1
      ) prn ON TRUE
      WHERE cs.start_date >= DATE_TRUNC('week', CURRENT_DATE)::date
      GROUP BY cs.start_date, cs.end_date
      ORDER BY cs.start_date ASC;
    `;
    return sessions;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch upcoming camp sessions with enrolments.');
  }
}

export async function fetchPastCampSessionsWithEnrolments(fromDate?: string, toDate?: string) {
  'use cache'
  cacheTag('camps');
  try {
    const rosterColumns = await campEnrolmentsRosterColumns();
    const noteExpression = rosterColumns.note ? sql`ce.note` : sql`NULL::text`;
    const parentNameExpression = rosterColumns.parent_name
      ? sql`COALESCE(NULLIF(ce.parent_name, ''), cust.name)`
      : sql`cust.name`;
    const parentPhoneExpression = rosterColumns.parent_phone
      ? sql`NULLIF(ce.parent_phone, '')`
      : sql`NULL::text`;
    const allergiesExpression = rosterColumns.allergies
      ? sql`NULLIF(ce.allergies, '')`
      : sql`NULL::text`;
    let whereConditions = sql`DATE_TRUNC('week', cs.start_date)::date < DATE_TRUNC('week', CURRENT_DATE)::date`;

    if (fromDate) {
      whereConditions = sql`${whereConditions} AND DATE_TRUNC('week', cs.start_date)::date >= ${fromDate}`;
    }

    if (toDate) {
      whereConditions = sql`${whereConditions} AND DATE_TRUNC('week', cs.start_date)::date <= ${toDate}`;
    }

    const sessions = await sql<Array<{
      start_date: Date;
      end_date: Date;
      enrolments: Array<{
        id: string;
        student_id: string;
        student_name: string;
        dob: Date | null;
        course_id: string | null;
        course_name: string | null;
        camp_type: 'FD' | 'PM' | 'AM';
        assigned_seat_number: number | null;
        note: string | null;
        special_needs: string | null;
        allergies: string | null;
        extended_care: boolean;
        parent_name: string | null;
        parent_phone: string | null;
        parent_request_notes: string | null;
      }>;
    }>>`
      SELECT 
        cs.start_date,
        cs.end_date,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', ce.id,
            'student_id', ce.student_id,
            'student_name', s.name,
            'dob', s.dob,
            'course_id', ce.course_id,
            'course_name', co.name,
            'camp_type', cs.camp_type,
            'assigned_seat_number', ce.assigned_seat_number,
            'note', ${noteExpression},
            'special_needs', s.special_needs,
            'allergies', ${allergiesExpression},
            'extended_care', cs.extended_care,
            'parent_name', ${parentNameExpression},
            'parent_phone', ${parentPhoneExpression},
            'parent_request_notes', prn.notes
          ) ORDER BY ce.assigned_seat_number NULLS LAST, s.name ASC
        ) FILTER (WHERE ce.id IS NOT NULL) AS enrolments
      FROM camp_sessions cs
      LEFT JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
      LEFT JOIN students s ON s.id = ce.student_id
      LEFT JOIN customers cust ON cust.id = s.customer_id
      LEFT JOIN courses co ON co.id = ce.course_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN NULLIF(pr.custom_notes, '') IS NOT NULL THEN 'Summer: ' || pr.custom_notes END,
            CASE WHEN NULLIF(pr.payload->>'fall_notes', '') IS NOT NULL THEN 'Fall: ' || (pr.payload->>'fall_notes') END,
            CASE WHEN pr.status = 'needs_manual_followup' THEN 'Needs follow-up' END
          ], NULL),
          E'\n'
        ) AS notes
        FROM parent_requests pr
        WHERE pr.student_id = s.id
          AND pr.is_latest = TRUE
          AND pr.removed_at IS NULL
          AND pr.request_type IN ('summer_scheduling', 'other')
        ORDER BY pr.submitted_at DESC
        LIMIT 1
      ) prn ON TRUE
      WHERE ${whereConditions}
      GROUP BY cs.start_date, cs.end_date
      ORDER BY cs.start_date DESC;
    `;
    return sessions;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch past camp sessions with enrolments.');
  }
}

export async function fetchCampSessionById(sessionId: string) {
  'use cache'
  cacheTag('camps');
  try {
    const rosterColumns = await campEnrolmentsRosterColumns();
    const noteExpression = rosterColumns.note ? sql`ce.note` : sql`NULL::text`;
    const parentNameExpression = rosterColumns.parent_name
      ? sql`COALESCE(NULLIF(ce.parent_name, ''), cust.name)`
      : sql`cust.name`;
    const parentPhoneExpression = rosterColumns.parent_phone
      ? sql`NULLIF(ce.parent_phone, '')`
      : sql`NULL::text`;
    const allergiesExpression = rosterColumns.allergies
      ? sql`NULLIF(ce.allergies, '')`
      : sql`NULL::text`;
    const [session] = await sql<Array<{
      id: string;
      start_date: Date;
      end_date: Date;
      extended_care: boolean;
      camp_type: 'FD' | 'PM' | 'AM';
    }>>`
      SELECT 
        id,
        start_date,
        end_date,
        extended_care,
        camp_type
      FROM camp_sessions
      WHERE id = ${sessionId};
    `;
    
    if (!session) return null;
    
    const enrolments = await sql<Array<{
      id: string;
      student_id: string;
      student_name: string;
      dob: Date | null;
      course_id: string | null;
      course_name: string | null;
      camp_type: 'FD' | 'PM' | 'AM';
      assigned_seat_number: number | null;
      note: string | null;
      special_needs: string | null;
      allergies: string | null;
      extended_care: boolean;
      parent_name: string | null;
      parent_phone: string | null;
      parent_request_notes: string | null;
    }>>`
      SELECT 
        ce.id,
        ce.student_id,
        s.name as student_name,
        s.dob,
        ce.course_id,
        co.name AS course_name,
        cs.camp_type,
        ce.assigned_seat_number,
        ${noteExpression} AS note,
        s.special_needs,
        ${allergiesExpression} AS allergies,
        cs.extended_care,
        ${parentNameExpression} AS parent_name,
        ${parentPhoneExpression} AS parent_phone,
        prn.notes AS parent_request_notes
      FROM camp_enrolments ce
      JOIN students s ON s.id = ce.student_id
      JOIN camp_sessions cs ON cs.id = ce.camp_session_id
      LEFT JOIN customers cust ON cust.id = s.customer_id
      LEFT JOIN courses co ON co.id = ce.course_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN NULLIF(pr.custom_notes, '') IS NOT NULL THEN 'Summer: ' || pr.custom_notes END,
            CASE WHEN NULLIF(pr.payload->>'fall_notes', '') IS NOT NULL THEN 'Fall: ' || (pr.payload->>'fall_notes') END,
            CASE WHEN pr.status = 'needs_manual_followup' THEN 'Needs follow-up' END
          ], NULL),
          E'\n'
        ) AS notes
        FROM parent_requests pr
        WHERE pr.student_id = s.id
          AND pr.is_latest = TRUE
          AND pr.removed_at IS NULL
          AND pr.request_type IN ('summer_scheduling', 'other')
        ORDER BY pr.submitted_at DESC
        LIMIT 1
      ) prn ON TRUE
      WHERE ce.camp_session_id = ${sessionId}
      ORDER BY ce.assigned_seat_number NULLS LAST, s.name ASC;
    `;
    
    return {
      ...session,
      enrolment_count: enrolments.length,
      enrolments
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp session.');
  }
}

export async function fetchCampSessionsByDateRange(startDate: Date, endDate: Date) {
  'use cache'
  cacheTag('camps');
  try {
    const rosterColumns = await campEnrolmentsRosterColumns();
    const noteExpression = rosterColumns.note ? sql`ce.note` : sql`NULL::text`;
    const parentNameExpression = rosterColumns.parent_name
      ? sql`COALESCE(NULLIF(ce.parent_name, ''), cust.name)`
      : sql`cust.name`;
    const parentPhoneExpression = rosterColumns.parent_phone
      ? sql`NULLIF(ce.parent_phone, '')`
      : sql`NULL::text`;
    const allergiesExpression = rosterColumns.allergies
      ? sql`NULLIF(ce.allergies, '')`
      : sql`NULL::text`;
    const enrolments = await sql<Array<{
      id: string;
      student_id: string;
      student_name: string;
      dob: Date | null;
      course_id: string | null;
      course_name: string | null;
      camp_type: 'FD' | 'PM' | 'AM';
      assigned_seat_number: number | null;
      note: string | null;
      special_needs: string | null;
      allergies: string | null;
      extended_care: boolean;
      parent_name: string | null;
      parent_phone: string | null;
      parent_request_notes: string | null;
    }>>`
      SELECT 
        ce.id,
        ce.student_id,
        s.name as student_name,
        s.dob,
        ce.course_id,
        co.name AS course_name,
        cs.camp_type,
        ce.assigned_seat_number,
        ${noteExpression} AS note,
        s.special_needs,
        ${allergiesExpression} AS allergies,
        cs.extended_care,
        ${parentNameExpression} AS parent_name,
        ${parentPhoneExpression} AS parent_phone,
        prn.notes AS parent_request_notes
      FROM camp_enrolments ce
      JOIN students s ON s.id = ce.student_id
      JOIN camp_sessions cs ON cs.id = ce.camp_session_id
      LEFT JOIN customers cust ON cust.id = s.customer_id
      LEFT JOIN courses co ON co.id = ce.course_id
      LEFT JOIN LATERAL (
        SELECT ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN NULLIF(pr.custom_notes, '') IS NOT NULL THEN 'Summer: ' || pr.custom_notes END,
            CASE WHEN NULLIF(pr.payload->>'fall_notes', '') IS NOT NULL THEN 'Fall: ' || (pr.payload->>'fall_notes') END,
            CASE WHEN pr.status = 'needs_manual_followup' THEN 'Needs follow-up' END
          ], NULL),
          E'\n'
        ) AS notes
        FROM parent_requests pr
        WHERE pr.student_id = s.id
          AND pr.is_latest = TRUE
          AND pr.removed_at IS NULL
          AND pr.request_type IN ('summer_scheduling', 'other')
        ORDER BY pr.submitted_at DESC
        LIMIT 1
      ) prn ON TRUE
      WHERE cs.start_date = ${startDate} AND cs.end_date = ${endDate}
      ORDER BY ce.assigned_seat_number NULLS LAST, s.name ASC;
    `;
    
    return {
      start_date: startDate,
      end_date: endDate,
      enrolment_count: enrolments.length,
      enrolments
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp sessions by date range.');
  }
}

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

    throw new Error('Invalid seat assignments date string');
  }

  if (Number.isNaN(value.getTime())) {
    throw new Error('Invalid seat assignments date');
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type CampLmsChecklistDbRow = Omit<
  CampLmsChecklistRow,
  | 'canvas_user_matches'
  | 'active_canvas_enrollments'
  | 'inactive_canvas_enrollments'
  | 'invited_canvas_enrollments'
  | 'expected_canvas_courses'
  | 'expected_canvas_course_ids'
  | 'active_expected_enrollments'
  | 'inactive_expected_enrollments'
  | 'extra_active_mapped_enrollments'
  | 'canvas_issues'
  | 'canvas_status'
  | 'canvas_status_label'
  | 'suggested_fix'
  | 'suggested_actions'
> & {
  canvas_user_matches: unknown;
  active_canvas_enrollments: unknown;
  inactive_canvas_enrollments: unknown;
  invited_canvas_enrollments: unknown;
};

const EMPTY_LMS_SUMMARY: CampLmsChecklistSummary = {
  total: 0,
  verified: 0,
  missing_setup: 0,
  needs_followup: 0,
  unmapped: 0,
  unchecked: 0,
  not_applicable: 0,
  canvas_ok: 0,
  canvas_not_synced: 0,
  canvas_missing_user: 0,
  canvas_missing_course: 0,
  canvas_inactive_expected: 0,
  canvas_extra_active: 0,
  canvas_unmapped: 0,
  lms_accounts_needed: 0,
  day_camp_total: 0,
  day_camp_assignments_needed: 0,
  unmapped_assigned_camps: 0,
  lms_course_fixes_needed: 0,
};

function asCanvasMatches(value: unknown): CampLmsCanvasMatch[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((match) => {
      if (!match || typeof match !== 'object') return null;
      const raw = match as Record<string, unknown>;
      if (raw.id == null) return null;

      return {
        id: String(raw.id),
        name: raw.name == null ? null : String(raw.name),
        login_id: raw.login_id == null ? null : String(raw.login_id),
        email: raw.email == null ? null : String(raw.email),
        sis_user_id: raw.sis_user_id == null ? null : String(raw.sis_user_id),
      };
    })
    .filter((match): match is CampLmsCanvasMatch => Boolean(match));
}

function asCanvasEnrollments(value: unknown): CampLmsCanvasEnrollment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((enrollment) => {
      if (!enrollment || typeof enrollment !== 'object') return null;
      const raw = enrollment as Record<string, unknown>;
      if (raw.enrollment_id == null || raw.course_id == null) return null;

      return {
        enrollment_id: String(raw.enrollment_id),
        course_id: String(raw.course_id),
        course_name: raw.course_name == null ? null : String(raw.course_name),
        state: raw.state == null ? 'unknown' : String(raw.state),
        role: raw.role == null ? null : String(raw.role),
        type: raw.type == null ? null : String(raw.type),
        updated_at: raw.updated_at == null ? null : String(raw.updated_at),
      };
    })
    .filter((enrollment): enrollment is CampLmsCanvasEnrollment => Boolean(enrollment));
}

function buildExpectedCanvasCourses(row: CampLmsChecklistDbRow): CampLmsExpectedCourse[] {
  const candidates: CampLmsExpectedCourse[] = [
    {
      level: 'beginner',
      course_id: row.canvas_beginner_course_id ?? '',
      course_name: row.canvas_beginner_course_name,
    },
    {
      level: 'intermediate',
      course_id: row.canvas_intermediate_course_id ?? '',
      course_name: row.canvas_intermediate_course_name,
    },
    {
      level: 'advanced',
      course_id: row.canvas_advanced_course_id ?? '',
      course_name: row.canvas_advanced_course_name,
    },
    ...asStringArray(row.canvas_additional_course_ids).map((courseId) => ({
      level: 'additional' as const,
      course_id: courseId,
      course_name: null,
    })),
  ];

  return candidates.filter((course) => course.course_id.trim().length > 0);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function canvasStatusLabel(status: CampLmsCanvasIssue) {
  const labels: Record<CampLmsCanvasIssue, string> = {
    ok: 'OK',
    not_synced: 'Not synced',
    unmapped_course: 'Unmapped camp course',
    missing_canvas_user: 'Missing Canvas user',
    missing_expected_course: 'Missing expected course',
    inactive_expected_course: 'Expected course inactive',
    extra_active_course: 'Extra active course',
  };

  return labels[status];
}

function primaryCanvasStatus(issues: CampLmsCanvasIssue[]): CampLmsCanvasIssue {
  const priority: CampLmsCanvasIssue[] = [
    'not_synced',
    'unmapped_course',
    'missing_canvas_user',
    'missing_expected_course',
    'inactive_expected_course',
    'extra_active_course',
  ];

  return priority.find((issue) => issues.includes(issue)) ?? 'ok';
}

function suggestedCanvasFix(params: {
  status: CampLmsCanvasIssue;
  login: string;
  manualMapping: boolean;
  beginnerCourseId: string | null;
  activeExpected: CampLmsCanvasEnrollment[];
  inactiveExpected: CampLmsCanvasEnrollment[];
  extraActive: CampLmsCanvasEnrollment[];
}) {
  const { status, login, manualMapping, beginnerCourseId, activeExpected, inactiveExpected, extraActive } = params;

  if (status === 'not_synced') return 'Click Sync LMS to read current Canvas users and enrollments.';
  if (status === 'unmapped_course') return 'Map this portal camp course to one shared Canvas course or multiple acceptable Canvas course IDs.';
  if (manualMapping) return 'Day Camp is handled manually by staff for each camper.';
  if (status === 'missing_canvas_user') return `Create or locate the Canvas user for ${login}, then sync again.`;
  if (status === 'missing_expected_course') {
    return beginnerCourseId
      ? `Add this camper to expected Canvas course ${beginnerCourseId}.`
      : 'Add this camper to one of the mapped Canvas courses.';
  }
  if (status === 'inactive_expected_course') {
    const course = inactiveExpected[0];
    return course
      ? `Reactivate or re-enroll the camper in ${course.course_name ?? course.course_id}.`
      : 'Reactivate one of the mapped Canvas course enrollments.';
  }
  if (status === 'extra_active_course') {
    const courseNames = extraActive
      .map((enrollment) => enrollment.course_name ?? enrollment.course_id)
      .join(', ');
    const suffix = activeExpected.length > 0
      ? ''
      : ` and add an expected Canvas course${beginnerCourseId ? ` ${beginnerCourseId}` : ''}`;
    return `Set extra active enrollment(s) inactive: ${courseNames}${suffix}.`;
  }

  return 'Expected Canvas setup is active.';
}

function isManualCampLmsCourse(row: Pick<CampLmsChecklistDbRow, 'is_day_camp' | 'day_camp_assigned_course_id'>) {
  return row.is_day_camp && !row.day_camp_assigned_course_id;
}

function suggestedCanvasActions(params: {
  row: CampLmsChecklistDbRow;
  expectedCourses: CampLmsExpectedCourse[];
  activeExpected: CampLmsCanvasEnrollment[];
  inactiveExpected: CampLmsCanvasEnrollment[];
  extraActive: CampLmsCanvasEnrollment[];
}): CampLmsSuggestedAction[] {
  const { row, expectedCourses, activeExpected, inactiveExpected, extraActive } = params;

  if (row.canvas_sync_status !== 'synced' || !row.canvas_user_found) return [];

  const actions: CampLmsSuggestedAction[] = [];
  const primaryExpectedCourse = expectedCourses.find((course) => course.level === 'beginner') ?? expectedCourses[0];
  if (primaryExpectedCourse && activeExpected.length === 0 && inactiveExpected.length === 0) {
    actions.push({
      type: 'add_expected_beginner',
      label: 'Add expected',
      canvas_course_id: primaryExpectedCourse.course_id,
      canvas_course_name: primaryExpectedCourse.course_name,
    });
  }

  extraActive.forEach((enrollment) => {
    actions.push({
      type: 'inactivate_enrollment',
      label: 'Make inactive',
      canvas_course_id: enrollment.course_id,
      canvas_course_name: enrollment.course_name,
      canvas_enrollment_id: enrollment.enrollment_id,
    });
  });

  return actions;
}

function buildCampLmsRows(rows: CampLmsChecklistDbRow[], allMappedCanvasCourseIds: Set<string>): CampLmsChecklistRow[] {
  return rows.map((row) => {
    const manualMapping = isManualCampLmsCourse(row);
    const expectedCourses = buildExpectedCanvasCourses(row);
    const expectedCourseIds = new Set(expectedCourses.map((course) => course.course_id));
    const activeEnrollments = asCanvasEnrollments(row.active_canvas_enrollments);
    const inactiveEnrollments = asCanvasEnrollments(row.inactive_canvas_enrollments);
    const activeExpected = activeEnrollments.filter((enrollment) => expectedCourseIds.has(enrollment.course_id));
    const inactiveExpected = inactiveEnrollments.filter((enrollment) => expectedCourseIds.has(enrollment.course_id));
    const extraActive = manualMapping
      ? []
      : activeEnrollments.filter((enrollment) =>
          allMappedCanvasCourseIds.has(enrollment.course_id) && !expectedCourseIds.has(enrollment.course_id)
        );

    const issues: CampLmsCanvasIssue[] = [];
    if (row.canvas_sync_status !== 'synced') issues.push('not_synced');
    if (expectedCourses.length === 0 && !manualMapping) issues.push('unmapped_course');
    if (row.canvas_sync_status === 'synced' && !row.canvas_user_found) issues.push('missing_canvas_user');
    if (row.canvas_sync_status === 'synced' && row.canvas_user_found && expectedCourses.length > 0 && activeExpected.length === 0) {
      issues.push(inactiveExpected.length > 0 ? 'inactive_expected_course' : 'missing_expected_course');
    }
    if (row.canvas_sync_status === 'synced' && row.canvas_user_found && extraActive.length > 0) {
      issues.push('extra_active_course');
    }

    const canvasIssues: CampLmsCanvasIssue[] = issues.length > 0 ? Array.from(new Set(issues)) : ['ok'];
    const canvasStatus = primaryCanvasStatus(canvasIssues);
    const suggestedActions = suggestedCanvasActions({
      row,
      expectedCourses,
      activeExpected,
      inactiveExpected,
      extraActive,
    });

    return {
      ...row,
      canvas_user_matches: asCanvasMatches(row.canvas_user_matches),
      active_canvas_enrollments: activeEnrollments,
      inactive_canvas_enrollments: inactiveEnrollments,
      invited_canvas_enrollments: asCanvasEnrollments(row.invited_canvas_enrollments),
      expected_canvas_courses: expectedCourses,
      expected_canvas_course_ids: Array.from(expectedCourseIds),
      active_expected_enrollments: activeExpected,
      inactive_expected_enrollments: inactiveExpected,
      extra_active_mapped_enrollments: extraActive,
      canvas_issues: canvasIssues,
      canvas_status: canvasStatus,
      canvas_status_label: canvasStatusLabel(canvasStatus),
      suggested_fix: suggestedCanvasFix({
        status: canvasStatus,
        login: row.suggested_lms_login,
        manualMapping,
        beginnerCourseId: row.canvas_beginner_course_id,
        activeExpected,
        inactiveExpected,
        extraActive,
      }),
      suggested_actions: suggestedActions,
    };
  });
}

async function fetchCampLmsDayCampCourseOptions(): Promise<CampLmsDayCampCourseOption[]> {
  const rows = await sql<CampLmsDayCampCourseOption[]>`
    WITH option_courses AS (
      SELECT
        ce.course_id::text AS id,
        MAX(c.name) AS label
      FROM camp_enrolments ce
      LEFT JOIN courses c ON c.id = ce.course_id
      WHERE ce.course_id IS NOT NULL
      GROUP BY ce.course_id::text

      UNION

      SELECT
        m.course_id AS id,
        COALESCE(MAX(c.name), m.lms_course_name, m.course_id) AS label
      FROM camp_lms_course_mappings m
      LEFT JOIN courses c ON c.id::text = m.course_id
      GROUP BY m.course_id, m.lms_course_name
    )
    SELECT DISTINCT ON (id)
      id,
      COALESCE(NULLIF(label, ''), id) AS label
    FROM option_courses
    WHERE id IS NOT NULL
      AND LOWER(CONCAT_WS(' ', id, label)) NOT LIKE '%day camp%'
    ORDER BY id, COALESCE(NULLIF(label, ''), id);
  `;

  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

export async function fetchCampPrintableSchedule(
  startDate: string,
  endDate: string
): Promise<CampPrintableScheduleData> {
  'use cache'
  cacheTag('camps');

  try {
    const rosterColumns = await campEnrolmentsRosterColumns();
    const noteExpression = rosterColumns.note ? sql`ce.note` : sql`NULL::text`;
    const parentNameExpression = rosterColumns.parent_name
      ? sql`COALESCE(NULLIF(ce.parent_name, ''), cust.name)`
      : sql`cust.name`;
    const parentPhoneExpression = rosterColumns.parent_phone
      ? sql`NULLIF(ce.parent_phone, '')`
      : sql`NULL::text`;
    const allergiesExpression = rosterColumns.allergies
      ? sql`NULLIF(ce.allergies, '')`
      : sql`NULL::text`;
    const rows = await sql<CampPrintableScheduleRow[]>`
      SELECT
        ce.id::text AS camp_enrolment_id,
        TRUNC(ce.student_id)::text AS student_id,
        s.name AS student_name,
        s.dob,
        ce.assigned_seat_number,
        COALESCE(seats.seat_assignments, '[]'::jsonb) AS seat_assignments,
        ce.course_id::text AS course_id,
        c.name AS course_name,
        cs.camp_type,
        cs.extended_care,
        cs.start_date,
        cs.end_date,
        ${noteExpression} AS note,
        s.special_needs,
        ${allergiesExpression} AS allergies,
        ${parentNameExpression} AS parent_name,
        ${parentPhoneExpression} AS parent_phone,
        prn.notes AS parent_request_notes
      FROM camp_sessions cs
      JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
      JOIN students s ON s.id = ce.student_id
      LEFT JOIN customers cust ON cust.id = s.customer_id
      LEFT JOIN courses c ON c.id = ce.course_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'date', sa.date::text,
            'seat', sa.seat
          )
          ORDER BY sa.date ASC
        ) AS seat_assignments
        FROM seat_assignments sa
        WHERE sa.enrolment_id = ce.id
          AND sa.date >= ${startDate}::date
          AND sa.date <= ${endDate}::date
      ) seats ON TRUE
      LEFT JOIN LATERAL (
        SELECT ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN NULLIF(pr.custom_notes, '') IS NOT NULL THEN 'Summer: ' || pr.custom_notes END,
            CASE WHEN NULLIF(pr.payload->>'fall_notes', '') IS NOT NULL THEN 'Fall: ' || (pr.payload->>'fall_notes') END,
            CASE WHEN pr.status = 'needs_manual_followup' THEN 'Needs follow-up' END
          ], NULL),
          E'\n'
        ) AS notes
        FROM parent_requests pr
        WHERE pr.student_id = s.id
          AND pr.is_latest = TRUE
          AND pr.removed_at IS NULL
          AND pr.request_type IN ('summer_scheduling', 'other')
        ORDER BY pr.submitted_at DESC
        LIMIT 1
      ) prn ON TRUE
      WHERE cs.start_date <= ${endDate}::date
        AND cs.end_date >= ${startDate}::date
      ORDER BY
        cs.start_date ASC,
        CASE cs.camp_type WHEN 'FD' THEN 1 WHEN 'AM' THEN 2 ELSE 3 END,
        c.name NULLS LAST,
        ce.course_id NULLS LAST,
        s.name ASC;
    `;
    const studentListOverrides = (await campPrintStudentListOverridesReady())
      ? await sql<CampPrintableStudentListOverride[]>`
          SELECT
            TRUNC(student_id)::text AS student_id,
            field,
            value
          FROM camp_print_student_list_overrides
          WHERE week_start = ${startDate}::date
            AND week_end = ${endDate}::date
          ORDER BY student_id::text ASC, field ASC;
        `
      : [];

    return {
      start_date: startDate,
      end_date: endDate,
      rows,
      student_list_overrides: studentListOverrides,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch printable camp schedule.');
  }
}

function summarizeCampLmsRows(rows: CampLmsChecklistRow[]): CampLmsChecklistSummary {
  const summary: CampLmsChecklistSummary = { ...EMPTY_LMS_SUMMARY };
  const students = new Set<string>();
  const lmsAccountKeys = new Set<string>();
  const dayCampAssignmentKeys = new Set<string>();
  const unmappedAssignedCampKeys = new Set<string>();
  const lmsCourseFixKeys = new Set<string>();

  rows.forEach((row) => {
    const mapped = row.expected_canvas_course_ids.length > 0;
    const needsCourseFix = row.canvas_issues.some((issue) =>
      issue === 'missing_expected_course'
      || issue === 'inactive_expected_course'
      || issue === 'extra_active_course'
    );

    students.add(row.student_id);
    if (!mapped) summary.unmapped += 1;
    if (!row.status) summary.unchecked += 1;
    if (row.status === 'verified') summary.verified += 1;
    if (row.status === 'missing_user' || row.status === 'missing_course') {
      summary.missing_setup += 1;
    }
    if (row.status === 'needs_followup') summary.needs_followup += 1;
    if (row.status === 'not_applicable') summary.not_applicable += 1;
    if (row.canvas_issues.includes('ok')) summary.canvas_ok += 1;
    if (row.canvas_issues.includes('not_synced')) summary.canvas_not_synced += 1;
    if (row.canvas_issues.includes('missing_canvas_user')) summary.canvas_missing_user += 1;
    if (row.canvas_issues.includes('missing_expected_course')) summary.canvas_missing_course += 1;
    if (row.canvas_issues.includes('inactive_expected_course')) summary.canvas_inactive_expected += 1;
    if (row.canvas_issues.includes('extra_active_course')) summary.canvas_extra_active += 1;
    if (row.canvas_issues.includes('unmapped_course')) summary.canvas_unmapped += 1;
    if (
      row.canvas_sync_status === 'synced'
      && !row.canvas_user_found
      && row.canvas_user_matches.length === 0
    ) {
      lmsAccountKeys.add(row.suggested_lms_login || row.student_id);
    }
    if (row.is_day_camp) summary.day_camp_total += 1;
    if (row.is_day_camp && !row.day_camp_assigned_course_id) {
      dayCampAssignmentKeys.add(`${row.student_id}:${row.camp_enrolment_id}`);
    }
    if (row.canvas_issues.includes('unmapped_course')) {
      unmappedAssignedCampKeys.add(`${row.student_id}:${row.course_id ?? row.camp_enrolment_id}`);
    }
    if (needsCourseFix) {
      const expectedKey = row.expected_canvas_course_ids.join(',');
      const extraActiveKey = row.extra_active_mapped_enrollments
        .map((enrollment) => enrollment.course_id)
        .sort()
        .join(',');
      lmsCourseFixKeys.add(`${row.student_id}:${row.course_id ?? ''}:${expectedKey}:${extraActiveKey}`);
    }
  });

  summary.total = students.size;
  summary.lms_accounts_needed = lmsAccountKeys.size;
  summary.day_camp_assignments_needed = dayCampAssignmentKeys.size;
  summary.unmapped_assigned_camps = unmappedAssignedCampKeys.size;
  summary.lms_course_fixes_needed = lmsCourseFixKeys.size;
  return summary;
}

export async function fetchCampLmsChecklist(startDate: string, endDate: string): Promise<CampLmsChecklistData> {
  try {
    const canvasConfig = await getCanvasPublicConfig();
    const [schema] = await sql<{ schema_ready: boolean }[]>`
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
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'public'
            AND t.relname = 'camp_lms_canvas_action_audit'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) LIKE '%create_user%'
        )
      ) AS schema_ready;
    `;

    const schemaReady = Boolean(schema?.schema_ready);

    if (!schemaReady) {
      const dbRows = await sql<CampLmsChecklistDbRow[]>`
        SELECT
          ce.id::text AS camp_enrolment_id,
          TRUNC(ce.student_id)::text AS student_id,
          s.name AS student_name,
          TRUNC(ce.student_id)::text || '@zebrarobotics.com' AS suggested_lms_login,
          ce.course_id::text AS course_id,
          c.name AS course_name,
          ce.course_id::text AS original_course_id,
          c.name AS original_course_name,
          LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%' AS is_day_camp,
          NULL::text AS day_camp_assigned_course_id,
          NULL::text AS day_camp_assigned_course_name,
          cs.camp_type,
          cs.extended_care,
          cs.start_date,
          cs.end_date,
          NULL::text AS lms_course_name,
          NULL::text AS lms_course_link,
          NULL::text AS mapping_notes,
          NULL::text AS canvas_course_family,
          NULL::text AS canvas_beginner_course_id,
          NULL::text AS canvas_beginner_course_name,
          NULL::text AS canvas_intermediate_course_id,
          NULL::text AS canvas_intermediate_course_name,
          NULL::text AS canvas_advanced_course_id,
          NULL::text AS canvas_advanced_course_name,
          '[]'::jsonb AS canvas_additional_course_ids,
          NULL::text AS canvas_user_id,
          NULL::text AS canvas_user_name,
          NULL::text AS canvas_user_login,
          NULL::text AS canvas_user_email,
          FALSE AS canvas_user_found,
          '[]'::jsonb AS canvas_user_matches,
          'not_synced'::text AS canvas_sync_status,
          NULL::text AS canvas_sync_error,
          NULL::timestamptz AS canvas_synced_at,
          '[]'::jsonb AS active_canvas_enrollments,
          '[]'::jsonb AS inactive_canvas_enrollments,
          '[]'::jsonb AS invited_canvas_enrollments,
          NULL::text AS status,
          NULL::text AS status_note,
          NULL::timestamptz AS checked_at,
          NULL::text AS checked_by_name
        FROM camp_sessions cs
        JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
        JOIN students s ON s.id = ce.student_id
        LEFT JOIN courses c ON c.id = ce.course_id
        WHERE DATE_TRUNC('week', cs.start_date)::date = ${startDate}::date
          AND cs.start_date <= ${endDate}::date
          AND cs.end_date >= ${startDate}::date
        ORDER BY ce.course_id NULLS LAST, s.name ASC, cs.camp_type ASC;
      `;
      const rows = buildCampLmsRows(dbRows, new Set());

      return {
        schema_ready: false,
        canvas_configured: canvasConfig.configured,
        canvas_token_source: canvasConfig.source,
        canvas_masked_token: canvasConfig.maskedToken,
        canvas_base_url: canvasConfig.baseUrl,
        canvas_last_synced_at: null,
        day_camp_course_options: [],
        rows,
        summary: summarizeCampLmsRows(rows),
      };
    }

    const mappingRows = await sql<Array<{
      canvas_beginner_course_id: string | null;
      canvas_intermediate_course_id: string | null;
      canvas_advanced_course_id: string | null;
      canvas_additional_course_ids: unknown;
    }>>`
      SELECT
        canvas_beginner_course_id,
        canvas_intermediate_course_id,
        canvas_advanced_course_id,
        canvas_additional_course_ids
      FROM camp_lms_course_mappings;
    `;
    const allMappedCanvasCourseIds = new Set(
      mappingRows
        .flatMap((row) => [
          row.canvas_beginner_course_id,
          row.canvas_intermediate_course_id,
          row.canvas_advanced_course_id,
          ...asStringArray(row.canvas_additional_course_ids),
        ])
        .filter((courseId): courseId is string => Boolean(courseId))
    );

    const dbRows = await sql<CampLmsChecklistDbRow[]>`
      SELECT
        ce.id::text AS camp_enrolment_id,
        TRUNC(ce.student_id)::text AS student_id,
        s.name AS student_name,
        TRUNC(ce.student_id)::text || '@zebrarobotics.com' AS suggested_lms_login,
        effective.course_id,
        effective.course_name,
        ce.course_id::text AS original_course_id,
        c.name AS original_course_name,
        effective.is_day_camp,
        pa_day.assigned_course_id AS day_camp_assigned_course_id,
        COALESCE(assigned_course.name, assigned_mapping.lms_course_name, pa_day.assigned_course_id) AS day_camp_assigned_course_name,
        cs.camp_type,
        cs.extended_care,
        cs.start_date,
        cs.end_date,
        m.lms_course_name,
        m.lms_course_link,
        m.notes AS mapping_notes,
        m.canvas_course_family,
        m.canvas_beginner_course_id,
        m.canvas_beginner_course_name,
        m.canvas_intermediate_course_id,
        m.canvas_intermediate_course_name,
        m.canvas_advanced_course_id,
        m.canvas_advanced_course_name,
        m.canvas_additional_course_ids,
        sync.canvas_user_id,
        sync.canvas_user_name,
        sync.canvas_user_login,
        sync.canvas_user_email,
        COALESCE(sync.canvas_user_found, FALSE) AS canvas_user_found,
        COALESCE(sync.canvas_user_matches, '[]'::jsonb) AS canvas_user_matches,
        COALESCE(sync.sync_status, 'not_synced') AS canvas_sync_status,
        sync.sync_error AS canvas_sync_error,
        sync.synced_at AS canvas_synced_at,
        COALESCE(sync.active_enrollments, '[]'::jsonb) AS active_canvas_enrollments,
        COALESCE(sync.inactive_enrollments, '[]'::jsonb) AS inactive_canvas_enrollments,
        COALESCE(sync.invited_enrollments, '[]'::jsonb) AS invited_canvas_enrollments,
        sc.status,
        sc.lms_note AS status_note,
        sc.checked_at,
        u.name AS checked_by_name
      FROM camp_sessions cs
      JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
      JOIN students s ON s.id = ce.student_id
      LEFT JOIN courses c ON c.id = ce.course_id
      LEFT JOIN camp_pa_day_course_assignments pa_day ON pa_day.camp_enrolment_id = ce.id
      LEFT JOIN courses assigned_course ON assigned_course.id::text = pa_day.assigned_course_id
      LEFT JOIN camp_lms_course_mappings assigned_mapping ON assigned_mapping.course_id = pa_day.assigned_course_id
      LEFT JOIN LATERAL (
        SELECT
          LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%' AS is_day_camp,
          CASE
            WHEN LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
              AND pa_day.assigned_course_id IS NOT NULL
            THEN pa_day.assigned_course_id
            ELSE ce.course_id::text
          END AS course_id,
          CASE
            WHEN LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
              AND pa_day.assigned_course_id IS NOT NULL
            THEN COALESCE(assigned_course.name, assigned_mapping.lms_course_name, pa_day.assigned_course_id)
            ELSE c.name
          END AS course_name
      ) effective ON TRUE
      LEFT JOIN camp_lms_course_mappings m ON m.course_id = effective.course_id
      LEFT JOIN camp_lms_canvas_sync_state sync ON sync.camp_enrolment_id = ce.id
      LEFT JOIN camp_lms_status_checks sc ON sc.camp_enrolment_id = ce.id
      LEFT JOIN users u ON u.id::text = sc.checked_by
      WHERE DATE_TRUNC('week', cs.start_date)::date = ${startDate}::date
        AND cs.start_date <= ${endDate}::date
        AND cs.end_date >= ${startDate}::date
      ORDER BY effective.course_id NULLS LAST, s.name ASC, cs.camp_type ASC;
    `;
    const rows = buildCampLmsRows(dbRows, allMappedCanvasCourseIds);
    const dayCampCourseOptions = await fetchCampLmsDayCampCourseOptions();
    const canvasLastSyncedAt = rows.reduce<Date | null>((latest, row) => {
      if (!row.canvas_synced_at) return latest;
      const syncedAt = new Date(row.canvas_synced_at);
      if (!latest || syncedAt > latest) return syncedAt;
      return latest;
    }, null);

    return {
      schema_ready: true,
      canvas_configured: canvasConfig.configured,
      canvas_token_source: canvasConfig.source,
      canvas_masked_token: canvasConfig.maskedToken,
      canvas_base_url: canvasConfig.baseUrl,
      canvas_last_synced_at: canvasLastSyncedAt,
      day_camp_course_options: dayCampCourseOptions,
      rows,
      summary: summarizeCampLmsRows(rows),
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp LMS checklist.');
  }
}

export async function fetchCampLmsCourseMappings(): Promise<CampLmsCourseMappingsData> {
  try {
    const [schema] = await sql<{ schema_ready: boolean }[]>`
      SELECT (
        to_regclass('public.camp_lms_course_mappings') IS NOT NULL
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
      ) AS schema_ready;
    `;
    const schemaReady = Boolean(schema?.schema_ready);

    if (!schemaReady) {
      return { schema_ready: false, rows: [] };
    }

    const rows = await sql<CampLmsCourseMappingRow[]>`
      WITH camp_courses AS (
        SELECT
          ce.course_id::text AS course_id,
          MAX(c.name) AS course_name,
          COUNT(*)::int AS camper_count
        FROM camp_enrolments ce
        JOIN camp_sessions cs ON cs.id = ce.camp_session_id
        LEFT JOIN courses c ON c.id = ce.course_id
        WHERE ce.course_id IS NOT NULL
        GROUP BY ce.course_id::text
      )
      SELECT
        camp_courses.course_id,
        camp_courses.course_name,
        camp_courses.camper_count,
        (m.course_id IS NOT NULL) AS mapped,
        m.lms_course_name,
        m.notes AS mapping_notes,
        m.canvas_beginner_course_id,
        m.canvas_intermediate_course_id,
        m.canvas_advanced_course_id,
        COALESCE(m.canvas_additional_course_ids, '[]'::jsonb) AS canvas_additional_course_ids
      FROM camp_courses
      LEFT JOIN camp_lms_course_mappings m ON m.course_id = camp_courses.course_id
      WHERE LOWER(CONCAT_WS(' ', camp_courses.course_id, camp_courses.course_name)) NOT LIKE '%day camp%'
      ORDER BY COALESCE(camp_courses.course_name, camp_courses.course_id), camp_courses.course_id;
    `;

    return { schema_ready: true, rows };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp LMS mappings.');
  }
}

type CampPrepDbRow = {
  camp_enrolment_id: string;
  student_id: string;
  student_name: string;
  course_id: string | null;
  course_name: string | null;
  original_course_id: string | null;
  original_course_name: string | null;
  is_pa_day_camp: boolean;
  pa_day_assigned_course_id: string | null;
  pa_day_assigned_course_name: string | null;
  camp_type: 'FD' | 'PM' | 'AM';
  extended_care: boolean;
  start_date: Date;
  end_date: Date;
  scratch_username: string | null;
  scratch_password: string | null;
  roblox_username: string | null;
  roblox_password: string | null;
  laptop_number: string | null;
};

function courseText(courseId: string | null, courseName: string | null) {
  return `${courseId ?? ''} ${courseName ?? ''}`.toLowerCase();
}

function deriveCampPrepNeeds(courseId: string | null, courseName: string | null) {
  const text = courseText(courseId, courseName);
  const needsScratch = /\bscratch\b/.test(text);
  const needsRoblox = /\broblox\b/.test(text);
  const needsUnity = /\bunity\b|c#|c\s*sharp|\bcsharp\b/.test(text);

  return {
    needs_scratch: needsScratch,
    needs_roblox: needsRoblox,
    needs_unity: needsUnity,
    needs_laptop: needsUnity,
  };
}

function buildCampPrepRow(row: CampPrepDbRow): CampAccountPrepRow {
  const needs = deriveCampPrepNeeds(row.course_id, row.course_name);
  const missingResources: CampPrepResourceKind[] = [];

  if (needs.needs_scratch && !row.scratch_username) {
    missingResources.push('scratch');
  }
  if (needs.needs_roblox && !row.roblox_username) {
    missingResources.push('roblox');
  }
  if (needs.needs_laptop && !row.laptop_number) {
    missingResources.push('laptop');
  }

  const neededCount = [
    needs.needs_scratch,
    needs.needs_roblox,
    needs.needs_laptop,
  ].filter(Boolean).length;

  let status: CampPrepStatus = 'not_needed';
  if (neededCount > 0 && missingResources.length === 0) {
    status = 'ready';
  } else if (neededCount > 0 && missingResources.length === neededCount) {
    status = 'missing';
  } else if (neededCount > 0) {
    status = 'partial';
  }

  return {
    ...row,
    ...needs,
    missing_resources: missingResources,
    status,
  };
}

function summarizeCampPrepRows(rows: CampAccountPrepRow[]): CampAccountPrepSummary {
  const missingScratchStudents = new Set<string>();
  const missingRobloxStudents = new Set<string>();
  const missingLaptopStudents = new Set<string>();
  const unityStudents = new Set<string>();

  const summary = rows.reduce<CampAccountPrepSummary>(
    (acc, row) => {
      acc.total += 1;
      if (row.needs_scratch || row.needs_roblox || row.needs_laptop) {
        acc.setup_needed += 1;
      }
      if (row.status === 'ready') acc.ready += 1;
      if (row.status === 'partial') acc.partial += 1;
      if (row.status === 'missing') acc.missing += 1;
      if (row.status === 'not_needed') acc.not_needed += 1;
      if (row.needs_unity) unityStudents.add(row.student_id);

      row.missing_resources.forEach((resource) => {
        if (resource === 'scratch') missingScratchStudents.add(row.student_id);
        if (resource === 'roblox') missingRobloxStudents.add(row.student_id);
        if (resource === 'laptop') missingLaptopStudents.add(row.student_id);
      });

      return acc;
    },
    {
      total: 0,
      setup_needed: 0,
      ready: 0,
      partial: 0,
      missing: 0,
      not_needed: 0,
      needs_unity: 0,
      missing_scratch: 0,
      missing_roblox: 0,
      missing_laptop: 0,
    }
  );

  return {
    ...summary,
    needs_unity: unityStudents.size,
    missing_scratch: missingScratchStudents.size,
    missing_roblox: missingRobloxStudents.size,
    missing_laptop: missingLaptopStudents.size,
  };
}

export async function fetchCampAccountPrepChecklist(
  startDate: string,
  endDate: string,
  targetDate?: string
): Promise<CampAccountPrepChecklistData> {
  'use cache'
  cacheTag('camps');

  try {
    const campDateFilter = targetDate
      ? sql`cs.start_date <= ${targetDate}::date AND cs.end_date >= ${targetDate}::date`
      : sql`DATE_TRUNC('week', cs.start_date)::date = ${startDate}::date
          AND cs.start_date <= ${endDate}::date
          AND cs.end_date >= ${startDate}::date`;

    const campRows = await sql<CampPrepDbRow[]>`
      SELECT
        ce.id::text AS camp_enrolment_id,
        ce.student_id::text AS student_id,
        s.name AS student_name,
        CASE
          WHEN LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
            AND pa_day.assigned_course_id IS NOT NULL
          THEN pa_day.assigned_course_id
          ELSE ce.course_id::text
        END AS course_id,
        CASE
          WHEN LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
            AND pa_day.assigned_course_id IS NOT NULL
          THEN COALESCE(assigned_course.name, assigned_mapping.lms_course_name, pa_day.assigned_course_id)
          ELSE c.name
        END AS course_name,
        ce.course_id::text AS original_course_id,
        c.name AS original_course_name,
        (
          LOWER(CONCAT_WS(' ', ce.course_id::text, c.name)) LIKE '%day camp%'
        ) AS is_pa_day_camp,
        pa_day.assigned_course_id AS pa_day_assigned_course_id,
        COALESCE(assigned_course.name, assigned_mapping.lms_course_name, pa_day.assigned_course_id) AS pa_day_assigned_course_name,
        cs.camp_type,
        cs.extended_care,
        cs.start_date,
        cs.end_date,
        scr.username AS scratch_username,
        scr.password AS scratch_password,
        rob.username AS roblox_username,
        rob.password AS roblox_password,
        lap.laptop_number
      FROM camp_sessions cs
      JOIN camp_enrolments ce ON ce.camp_session_id = cs.id
      JOIN students s ON s.id = ce.student_id
      LEFT JOIN courses c ON c.id = ce.course_id
      LEFT JOIN camp_pa_day_course_assignments pa_day ON pa_day.camp_enrolment_id = ce.id
      LEFT JOIN courses assigned_course ON assigned_course.id::text = pa_day.assigned_course_id
      LEFT JOIN camp_lms_course_mappings assigned_mapping ON assigned_mapping.course_id = pa_day.assigned_course_id
      LEFT JOIN LATERAL (
        SELECT username, password
        FROM scratch_accounts
        WHERE student_id = s.id
        ORDER BY username
        LIMIT 1
      ) scr ON TRUE
      LEFT JOIN LATERAL (
        SELECT username, password
        FROM roblox_accounts
        WHERE student_id = s.id
        ORDER BY username
        LIMIT 1
      ) rob ON TRUE
      LEFT JOIN LATERAL (
        SELECT laptop_number
        FROM laptop_assignments
        WHERE student_id = s.id
        ORDER BY laptop_number
        LIMIT 1
      ) lap ON TRUE
      WHERE ${campDateFilter}
      ORDER BY course_name NULLS LAST, s.name ASC, cs.camp_type ASC;
    `;
    const paDayCourseOptions = await sql<CampAccountPrepCourseOption[]>`
      SELECT DISTINCT
        c.id::text AS id,
        c.name AS label
      FROM courses c
      JOIN camp_enrolments ce ON ce.course_id::text = c.id::text
      WHERE NOT (
        LOWER(CONCAT_WS(' ', c.id::text, c.name)) LIKE '%day camp%'
      )
      ORDER BY c.name;
    `;
    const scratchAccounts = await sql<{ id: string; label: string; password: string | null }[]>`
      SELECT
        username AS id,
        username AS label,
        password
      FROM scratch_accounts
      WHERE student_id IS NULL
      ORDER BY username;
    `;
    const robloxAccounts = await sql<{ id: string; label: string; password: string | null }[]>`
      SELECT
        username AS id,
        username AS label,
        password
      FROM roblox_accounts
      WHERE student_id IS NULL
      ORDER BY username;
    `;
    const laptops = await sql<{ id: string; label: string; password: string | null }[]>`
      SELECT
        laptop_number AS id,
        'Laptop #' || laptop_number AS label,
        NULL::text AS password
      FROM laptop_assignments
      WHERE student_id IS NULL
      ORDER BY laptop_number;
    `;

    const rows = campRows.map(buildCampPrepRow);

    return {
      rows,
      inventory: {
        scratch_accounts: scratchAccounts,
        roblox_accounts: robloxAccounts,
        laptops,
      },
      pa_day_course_options: paDayCourseOptions,
      summary: summarizeCampPrepRows(rows),
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp account prep checklist.');
  }
}

export async function fetchSeatAssignments(date: Date | string) {
  'use cache'
  cacheTag('camps');
  try {
    const dateKey = toLocalDateKey(date);

    const rows = await sql<Array<{
      enrolment_id: string;
      seat: number;
    }>>`
      SELECT enrolment_id, seat
      FROM seat_assignments
      WHERE date = ${dateKey}::date
    `;

    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch seat assignments.');
  }
}

export async function fetchCampActivitySchedule(weekStart: Date | string) {
  'use cache'
  cacheTag('camps');
  try {
    const weekStartKey = toLocalDateKey(weekStart);

    const rows = await sql<Array<{
      block_key: string;
      room: string;
      weekday: number;
      activity: string | null;
    }>>`
      SELECT block_key, room, weekday, activity
      FROM camp_activity_schedules
      WHERE week_start = ${weekStartKey}::date
    `;

    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp activity schedule.');
  }
}

export async function fetchCampStaffSchedule(weekStart: Date | string) {
  'use cache'
  cacheTag('camps');
  try {
    const weekStartKey = toLocalDateKey(weekStart);

    const rows = await sql<Array<{
      row_key: string;
      weekday: number;
      content: string | null;
    }>>`
      SELECT row_key, weekday, content
      FROM camp_staff_schedules
      WHERE week_start = ${weekStartKey}::date
    `;

    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp staff schedule.');
  }
}

export async function fetchCampPrintLog(weekStart: Date | string) {
  'use cache'
  cacheTag('camps');
  try {
    const weekStartKey = toLocalDateKey(weekStart);

    const rows = await sql<Array<{
      id: number;
      student: string | null;
      print_description: string | null;
      status: string | null;
      notes: string | null;
    }>>`
      SELECT id, student, print_description, status, notes
      FROM camp_print_log
      WHERE week_start = ${weekStartKey}::date
      ORDER BY position ASC, id ASC
    `;

    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch camp print log.');
  }
}

export async function fetchMostRecentSeatAssignmentsInWeek(
  enrolmentIds: string[],
  targetDate: Date | string,
) {
  'use cache'
  cacheTag('camps');

  if (enrolmentIds.length === 0) return [];

  try {
    const targetDateKey = toLocalDateKey(targetDate);
    const [year, month, day] = targetDateKey.split('-').map(Number);
    const localTargetDate = new Date(year, month - 1, day);
    const dayOfWeek = localTargetDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStartDate = new Date(localTargetDate);
    weekStartDate.setDate(localTargetDate.getDate() - daysFromMonday);
    const weekStartKey = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`;

    const rows = await sql<Array<{
      enrolment_id: string;
      seat: number;
      assigned_date: Date;
    }>>`
      WITH calendar_days AS (
        SELECT day::date AS day
        FROM generate_series(
          ${weekStartKey}::date,
          (${targetDateKey}::date - INTERVAL '1 day')::date,
          INTERVAL '1 day'
        ) AS day
      ),
      ranked AS (
        SELECT
          sa.enrolment_id,
          sa.seat,
          sa.date AS assigned_date,
          ROW_NUMBER() OVER (
            PARTITION BY sa.enrolment_id
            ORDER BY sa.date DESC
          ) AS rn
        FROM calendar_days cd
        JOIN seat_assignments sa ON sa.date = cd.day
        WHERE sa.enrolment_id = ANY(${enrolmentIds}::uuid[])
      )
      SELECT enrolment_id, seat, assigned_date
      FROM ranked
      WHERE rn = 1
    `;

    return rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch recent seat assignments for week.');
  }
}

// Global student search with comprehensive details
export async function searchStudents(query: string) {
  try {
    const today = Y(new Date());
    
    const students = await sql<Array<{
      id: string;
      name: string;
      load: number;
      customer_id: string;
      customer_name: string;
      customer_email: string;
      enrollments: Array<{
        id: string;
        course_name: string;
        weekday: string;
        start_time: string;
        end_time: string;
        session_id: string;
      }>;
      last_absence: {
        date: Date;
        course_name: string;
      } | null;
      upcoming_absence: {
        date: Date;
        course_name: string;
      } | null;
      last_makeup: {
        date: Date;
        course_name: string;
        weekday: string;
        start_time: string;
      } | null;
      upcoming_makeup: {
        date: Date;
        course_name: string;
        weekday: string;
        start_time: string;
      } | null;
      notes: Array<{
        id: string;
        content: string;
        date: Date;
        creator: string;
      }>;
    }>>`
      WITH student_matches AS (
        SELECT s.id, s.name, s.load, s.customer_id, c.name as customer_name, c.email as customer_email
        FROM students s
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.name ILIKE '%' || ${query} || '%'
        LIMIT 10
      ),
      student_enrollments AS (
        SELECT 
          e.student_id,
          COALESCE(
            json_agg(
              json_build_object(
                'id', e.id,
                'course_name', co.name,
                'weekday', se.weekday,
                'start_time', se.start_time,
                'end_time', se.end_time,
                'session_id', se.id
              )
              ORDER BY se.weekday, se.start_time
            ) FILTER (WHERE e.id IS NOT NULL),
            '[]'::json
          ) AS enrollments
        FROM student_matches sm
        JOIN enrolments e ON e.student_id = sm.id
        LEFT JOIN courses co ON co.id = e.course_id
        LEFT JOIN sessions se ON se.id = e.session_id
        GROUP BY e.student_id
      ),
      last_absences AS (
        SELECT DISTINCT ON (sm.id)
          sm.id as student_id,
          json_build_object(
            'date', a.date,
            'course_name', co.name
          ) as last_absence
        FROM student_matches sm
        JOIN enrolments e ON e.student_id = sm.id
        JOIN absences a ON a.enrolment_id = e.id
        JOIN courses co ON co.id = e.course_id
        WHERE a.date < ${today}
        ORDER BY sm.id, a.date DESC
      ),
      upcoming_absences AS (
        SELECT DISTINCT ON (sm.id)
          sm.id as student_id,
          json_build_object(
            'date', a.date,
            'course_name', co.name
          ) as upcoming_absence
        FROM student_matches sm
        JOIN enrolments e ON e.student_id = sm.id
        JOIN absences a ON a.enrolment_id = e.id
        JOIN courses co ON co.id = e.course_id
        WHERE a.date >= ${today}
        ORDER BY sm.id, a.date ASC
      ),
      last_makeups AS (
        SELECT DISTINCT ON (sm.id)
          sm.id as student_id,
          json_build_object(
            'date', m.date,
            'course_name', co.name,
            'weekday', se.weekday,
            'start_time', se.start_time
          ) as last_makeup
        FROM student_matches sm
        JOIN makeups m ON m.student_id = sm.id
        LEFT JOIN courses co ON co.id = m.course_id
        LEFT JOIN sessions se ON se.id = m.session_id
        WHERE m.date < ${today}
        ORDER BY sm.id, m.date DESC
      ),
      upcoming_makeups AS (
        SELECT DISTINCT ON (sm.id)
          sm.id as student_id,
          json_build_object(
            'date', m.date,
            'course_name', co.name,
            'weekday', se.weekday,
            'start_time', se.start_time
          ) as upcoming_makeup
        FROM student_matches sm
        JOIN makeups m ON m.student_id = sm.id
        LEFT JOIN courses co ON co.id = m.course_id
        LEFT JOIN sessions se ON se.id = m.session_id
        WHERE m.date >= ${today}
        ORDER BY sm.id, m.date ASC
      ),
      student_notes_agg AS (
        SELECT 
          sn.student_id,
          COALESCE(
            json_agg(
              json_build_object(
                'id', sn.id,
                'content', sn.content,
                'date', sn.date,
                'creator', sn.creator
              )
              ORDER BY sn.date DESC
            ) FILTER (WHERE sn.id IS NOT NULL),
            '[]'::json
          ) AS notes
        FROM student_matches sm
        JOIN student_notes sn ON sn.student_id = sm.id
        GROUP BY sn.student_id
      )
      SELECT 
        sm.id,
        sm.name,
        COALESCE(sm.load, 1)::float8 AS load,
        sm.customer_id,
        sm.customer_name,
        sm.customer_email,
        COALESCE(se.enrollments, '[]'::json) as enrollments,
        la.last_absence,
        ua.upcoming_absence,
        lm.last_makeup,
        um.upcoming_makeup,
        COALESCE(sna.notes, '[]'::json) as notes
      FROM student_matches sm
      LEFT JOIN student_enrollments se ON se.student_id = sm.id
      LEFT JOIN last_absences la ON la.student_id = sm.id
      LEFT JOIN upcoming_absences ua ON ua.student_id = sm.id
      LEFT JOIN last_makeups lm ON lm.student_id = sm.id
      LEFT JOIN upcoming_makeups um ON um.student_id = sm.id
      LEFT JOIN student_notes_agg sna ON sna.student_id = sm.id
      ORDER BY sm.name;
    `;
    
    return students;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to search students.');
  }
}

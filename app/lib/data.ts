'use server'

import postgres from 'postgres';
import { nextOccurrenceOf } from './utils';
import { InvoiceTableData, CustomerTableData, ScheduleRow, StudentTableData, Session, RecurringInvoice, RecurringInvoiceListData, TrialRow, MakeupRow, PickupListDisplay, SlipInfo, StudentNote, CustomerNote, TrialNote } from './definitions';
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
  let whereConditions = sql`(c.name ILIKE '%' || ${query} || '%' OR c.email ILIKE '%' || ${query} || '%')`;
  
  if (qboFilter === 'setup') {
    whereConditions = sql`${whereConditions} AND c.set_up_qbo = true`;
  } else if (qboFilter === 'not-setup') {
    whereConditions = sql`${whereConditions} AND (c.set_up_qbo = false OR c.set_up_qbo IS NULL)`;
  }
  
  // Build HAVING clause for aggregated filters
  let havingConditions = sql`TRUE`;
  
  if (balanceFilter === 'has-balance') {
    havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) > 0`;
  } else if (balanceFilter === 'no-balance') {
    havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) <= 0`;
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
      (crp.next_payment IS NOT NULL AND rec.next_invoice_date IS NOT NULL) AND
      (crp.next_payment != rec.next_invoice_date OR (crp.amount * 100)::INTEGER != rec.next_invoice_amount)
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
    let whereConditions = sql`(c.name ILIKE ${`%${query}%`} OR c.email ILIKE ${`%${query}%`})`;
    
    if (qboFilter === 'setup') {
      whereConditions = sql`${whereConditions} AND c.set_up_qbo = true`;
    } else if (qboFilter === 'not-setup') {
      whereConditions = sql`${whereConditions} AND (c.set_up_qbo = false OR c.set_up_qbo IS NULL)`;
    }
    
    // If we have filters that require aggregation, use a subquery
    if (balanceFilter || studentsFilter || paymentsFilter || recurringPaymentsFilter || scheduledInvoicesFilter || paymentMatchFilter) {
      let havingConditions = sql`TRUE`;
      
      if (balanceFilter === 'has-balance') {
        havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) > 0`;
      } else if (balanceFilter === 'no-balance') {
        havingConditions = sql`${havingConditions} AND (COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0)) <= 0`;
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
          (crp.next_payment IS NOT NULL AND rec.next_invoice_date IS NOT NULL) AND
          (crp.next_payment != rec.next_invoice_date OR (crp.amount * 100)::INTEGER != rec.next_invoice_amount)
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





export async function fetchSessionStudents(sessionId: string, date?: Date) {
  'use cache'
  
  try {
    
    cacheTag('schedule')
    cacheTag('studentsnotes')
    // If no date provided, compute the next occurrence of this session's weekday
    let targetDate = date;
    
    if (!targetDate) {
      const rows = await sql<{ weekday: Weekday }[]>`
        SELECT weekday
        FROM sessions
        WHERE id = ${sessionId}
        LIMIT 1;
      `;
      if (!rows.length) throw new Error("Session not found");
      targetDate = nextOccurrenceOf(rows[0].weekday);
    }

    const target = Y(targetDate);
    console.log(target)

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
      JOIN courses crs ON crs.id = e.course_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN absences abs
        ON abs.enrolment_id = e.id
       AND abs.date = ${target}::date
      LEFT JOIN latest_note ln ON ln.student_id = s.id
      WHERE e.session_id = ${sessionId}
        AND (e.start_date IS NULL OR e.start_date <= ${target}::date)
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
  let targetDate = date;
    
    if (!targetDate) {
      const rows = await sql<{ weekday: Weekday }[]>`
        SELECT weekday
        FROM sessions
        WHERE id = ${sessionId}
        LIMIT 1;
      `;
      if (!rows.length) throw new Error("Session not found");
      targetDate = nextOccurrenceOf(rows[0].weekday);
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
    JOIN courses crs ON crs.id = m.course_id
    LEFT JOIN latest_note ln ON ln.student_id = s.id
    WHERE m.session_id = ${sessionId} AND m.date = ${target}
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

  let targetDate = date;
    
    if (!targetDate) {
      const rows = await sql<{ weekday: Weekday }[]>`
        SELECT weekday
        FROM sessions
        WHERE id = ${sessionId}
        LIMIT 1;
      `;
      if (!rows.length) throw new Error("Session not found");
      targetDate = nextOccurrenceOf(rows[0].weekday);
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
    JOIN courses crs ON crs.id = t.course_id
    LEFT JOIN latest_trial_note ltn ON ltn.trial_id = t.id
    WHERE t.session_id = ${sessionId} AND t.date = ${target}
    ORDER BY t.date;
  `;
  return students;
  } catch (error){
    throw new Error ('Failed to fetch trials');
  }
}

export async function fetchSessionsForDay(day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday', date?: Date) {
  'use cache'
  
  try {
        // Calculate target date if not provided
        let targetDate = date;
        if (!targetDate) {
          targetDate = nextOccurrenceOf(day);
        }
        const target = Y(targetDate);

        const sessions = await sql<Session[]>
        `
          SELECT
            s.id,
            s.weekday,
            s.start_time,
            s.end_time,
            COALESCE(ec.student_count, 0) AS student_count,
            COALESCE(mc.makeup_count, 0)  AS makeup_count,
            COALESCE(tc.trial_count, 0)   AS trial_count,
            COALESCE(ac.absence_count, 0) AS absences
          FROM sessions s
          LEFT JOIN LATERAL (
            SELECT COUNT(*) AS student_count
            FROM enrolments e
            WHERE e.session_id = s.id
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
            WHERE e.session_id = s.id
              AND a.date = ${target}
          ) ac ON true
          WHERE s.weekday = ${day}
            AND (
              COALESCE(ec.student_count, 0) > 0
              OR COALESCE(mc.makeup_count, 0) > 0
              OR COALESCE(tc.trial_count, 0) > 0
            )
          ORDER BY s.start_time;
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
      SELECT id, name, email
      FROM customers
      WHERE name ILIKE '%' || ${query} || '%' OR email ILIKE '%' || ${query} || '%'
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
    let weekday = day.toLowerCase()
    let school_name = school?.toLowerCase();

    let targetDate = date;

    targetDate = nextOccurrenceOf(day);


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
          OR s.name ILIKE ${`%${query}%`})
          ${unassignedOnly ? sql`AND scr.student_id IS NULL` : sql``}
        
        UNION ALL
        
        SELECT username FROM roblox_accounts rob
        LEFT JOIN students s ON s.id = rob.student_id
        WHERE 
          (rob.username ILIKE ${`%${query}%`}
          OR s.name ILIKE ${`%${query}%`})
          ${unassignedOnly ? sql`AND rob.student_id IS NULL` : sql``}
        
        UNION ALL
        
        SELECT laptop_number AS username FROM laptop_assignments lap
        LEFT JOIN students s ON s.id = lap.student_id
        WHERE 
          (lap.laptop_number ILIKE ${`%${query}%`}
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
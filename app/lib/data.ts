'use server'

import postgres from 'postgres';
import { CustomerTableData, ScheduleRow, StudentTableData, Session, RecurringInvoice, RecurringInvoiceListData, TrialRow, MakeupRow } from './definitions';
import { cacheTag, unstable_cache } from 'next/cache';
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const ITEMS_PER_PAGE = 10;
export async function fetchFilteredCustomers(
  query: string,
  currentPage: number,
  sortBy: string,
  incDec: boolean,
) {

  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  try {
    const customers = await sql<CustomerTableData[]>`
    WITH inv AS (
        SELECT customer_id, COALESCE(SUM(amount),0) AS sum_invoices,
        MIN(amount) AS next_invoice_amount
        FROM invoices GROUP BY customer_id
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
        rec.next_invoice_date,
        rec.next_invoice_amount,
        pay.regular_payment_amount,
        COALESCE(stu.students, '[]'::jsonb) AS students
        FROM customers c
        LEFT JOIN inv ON inv.customer_id = c.id
        LEFT JOIN pay ON pay.customer_id = c.id
        LEFT JOIN stu ON stu.customer_id = c.id
        LEFT JOIN rec ON rec.customer_id = c.id
        WHERE (c.name ILIKE '%' || ${query} || '%' OR c.email ILIKE '%' || ${query} || '%')
        ORDER BY ${sql(sortBy)} DESC
        LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset};
        `
        return customers;

      
    
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customers.');
  }
}

export async function fetchCustomerPages(query: string) {
  try {
    const data = await sql`SELECT COUNT(*)
    FROM customers
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`}
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

export async function fetchFilteredStudentsTable(
  query: string,
  currentPage: number,
  sortBy: string,
 
) {
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
    )
    SELECT
      s.id::text                                 AS id,
      s.name                                     AS name,
      c.name                                     AS customer_name,
      COALESCE(ec.enrolled_courses, '[]'::jsonb) AS enrolled_courses,
      COALESCE(pd.pickup_days, '[]'::jsonb)      AS pickup_days
    FROM students s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN ec ON ec.student_id = s.id
    LEFT JOIN pd ON pd.student_id = s.id
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


const Y = (d: Date) => d.toISOString().slice(0, 10); // 'YYYY-MM-DD'

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;
type Weekday = typeof WEEKDAYS[number];

function nextOccurrenceOf(weekday: Weekday, from = new Date()): Date {
  const targetIdx = WEEKDAYS.indexOf(weekday);
  const fromIdx = from.getDay();
  let delta = (targetIdx - fromIdx + 7) % 7;
  const dt = new Date(from);  // clone
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() + delta);
  return dt;
}

export async function fetchSessionStudents(sessionId: string, date?: Date) {
  'use cache'
  
  try {
    
    cacheTag('schedule')
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
      SELECT
        e.id AS enrolment_id,
        s.name,
        crs.name AS course_name,
        (abs.enrolment_id IS NOT NULL) AS absent
      FROM students s
      JOIN enrolments e ON e.student_id = s.id
      JOIN courses crs ON crs.id = e.course_id
      LEFT JOIN absences abs
        ON abs.enrolment_id = e.id
       AND abs.date = ${target}::date
      WHERE e.session_id = ${sessionId}
      ORDER BY s.name;
    `;

    return students;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch session students.');
  } 
}

export async function fetchUpcomingSessionMakeups(sessionId: string){
  'use cache'
  try{
    
  cacheTag('schedule')
  const students = await sql<MakeupRow[]>`
    SELECT m.id AS makeup_id, s.name, crs.name AS course_name, m.date
    FROM students s
    JOIN makeups m ON m.student_id = s.id
    JOIN courses crs ON crs.id = m.course_id
    WHERE m.session_id = ${sessionId}
    ORDER BY m.date;
  `;
  return students;
  } catch (error){
    throw new Error ('Failed to fetch makeups');
  }
}

export async function fetchUpcomingSessionTrials(sessionId: string){
  'use cache'
  try{
  
  cacheTag('schedule')
  const students = await sql<TrialRow[]>`
    SELECT t.id AS trial_id, t.name, crs.name AS course_name, t.date
    FROM trials t
    JOIN courses crs ON crs.id = t.course_id
    WHERE t.session_id = ${sessionId}
    ORDER BY t.date;
  `;
  return students;
  } catch (error){
    throw new Error ('Failed to fetch trials');
  }
}

export async function fetchSessionsForDay(day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday') {
  'use cache'
  
  try {
     
        const sessions = await sql<Session[]>
        `
          SELECT
            s.id,
            s.weekday,
            s.start_time,
            s.end_time,
            COALESCE(ec.student_count, 0) AS student_count,
            COALESCE(mc.makeup_count, 0)  AS makeup_count,
            COALESCE(tc.trial_count, 0)   AS trial_count
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
          ) mc ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*) AS trial_count
            FROM trials t
            WHERE t.session_id = s.id
          ) tc ON true
          WHERE s.weekday = ${day}
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
      SELECT id, amount, every, day_of_month, next_date, description
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


'use server'

import postgres from 'postgres';
import { nextOccurrenceOf } from './utils';
import { CustomerTableData, ScheduleRow, StudentTableData, Session, RecurringInvoice, RecurringInvoiceListData, TrialRow, MakeupRow, PickupListDisplay, SlipInfo } from './definitions';
import { cacheTag, unstable_cache } from 'next/cache';



const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;
type Weekday = typeof WEEKDAYS[number];

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
        s.id as student_id,
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

export async function fetchUpcomingSessionMakeups(sessionId: string, date?: Date){
  'use cache'
  try{
    
  cacheTag('schedule')

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
    SELECT m.id AS makeup_id, s.name, s.id as student_id, crs.name AS course_name, m.date
    FROM students s
    JOIN makeups m ON m.student_id = s.id
    JOIN courses crs ON crs.id = m.course_id
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
    SELECT t.id AS trial_id, t.name, crs.name AS course_name, t.date
    FROM trials t
    JOIN courses crs ON crs.id = t.course_id
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
      SELECT p.*, s.name AS name, CASE WHEN pa.id IS NOT NULL THEN true ELSE false END AS absent
      FROM pickups p
      LEFT JOIN students s ON p.student_id = s.id
      LEFT JOIN pickup_absences pa ON p.id = pa.pickup_id AND pa.date = ${target}
      WHERE p.weekday = ${weekday} AND p.school_name=${school_name??'frankland'}
      ORDER BY p.school_name, s.name;
    `
    return pickups;
  }catch(error){
    console.error('Database Error:', error);
    throw new Error('Failed to fetch session students.');
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

export async function fetchFilteredScratchAccounts(query: string, unassignedOnly: boolean) {
  try {
    const accounts = await sql<{
      username: string;
      password: string;
      student_id: string | null;
      student_name: string | null;
    }[]>`
      SELECT 
        scr.username,
        scr.password,
        scr.student_id,
        s.name AS student_name
      FROM scratch_accounts scr
      LEFT JOIN students s ON s.id = scr.student_id
      WHERE 
        (scr.username ILIKE ${`%${query}%`}
        OR s.name ILIKE ${`%${query}%`})
        ${unassignedOnly ? sql`AND scr.student_id IS NULL` : sql``}
      ORDER BY scr.username
      LIMIT 50;
    `;
    return accounts;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch scratch accounts.');
  }
}

export async function fetchStudentsForAssignment(query: string) {
  try {
    const students = await sql<{
      id: string;
      name: string;
      email: string;
    }[]>`
      SELECT 
        id,
        name,
        email
      FROM students
      WHERE 
        name ILIKE ${`%${query}%`}
        OR email ILIKE ${`%${query}%`}
      ORDER BY name
      LIMIT 20;
    `;
    return students;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch students for assignment.');
  }
}


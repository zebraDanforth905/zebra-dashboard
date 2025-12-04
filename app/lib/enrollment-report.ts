'use server'

import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export type EnrollmentReportRow = {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  student_id: string;
  student_name: string;
  student_dob: Date | null;
  enrolment_id: string;
  enrolment_start_date: Date;
  course_name: string;
  course_price: number;
  session_time: string;
  session_weekday: string;
  recurring_invoice_id: string | null;
  recurring_invoice_amount: number | null;
  recurring_invoice_description: string | null;
  recurring_invoice_next_date: Date | null;
  customer_total_expected: number;
  customer_total_enrollments: number;
  customer_total_pickups: number;
  customer_note_id: string | null;
  customer_note: string | null;
  customer_note_date: Date | null;
  customer_note_creator: string | null;
  student_note_id: string | null;
  student_note: string | null;
  student_note_date: Date | null;
  student_note_creator: string | null;
};

export async function fetchEnrollmentReport(startDate: string, endDate: string) {
  try {
    const enrollments = await sql<Array<EnrollmentReportRow>>`
      WITH customer_totals AS (
        SELECT 
          c.id as customer_id,
          COALESCE(SUM(co.price), 0) as total_enrollments,
          COUNT(DISTINCT (s.id, p.weekday)) FILTER (WHERE p.id IS NOT NULL) * 40 as total_pickups
        FROM customers c
        LEFT JOIN students s ON s.customer_id = c.id
        LEFT JOIN enrolments e ON e.student_id = s.id
        LEFT JOIN courses co ON co.id = e.course_id
        LEFT JOIN pickups p ON p.student_id = s.id
        GROUP BY c.id
      ),
      recent_customer_notes AS (
        SELECT DISTINCT ON (customer_id)
          customer_id,
          id as customer_note_id,
          content as customer_note,
          date as customer_note_date,
          creator as customer_note_creator
        FROM customer_notes
        ORDER BY customer_id, date DESC, id DESC
      ),
      recent_student_notes AS (
        SELECT DISTINCT ON (student_id)
          student_id,
          id as student_note_id,
          content as student_note,
          date as student_note_date,
          creator as student_note_creator
        FROM student_notes
        ORDER BY student_id, date DESC, id DESC
      )
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.email as customer_email,
        s.id as student_id,
        s.name as student_name,
        s.dob as student_dob,
        e.id as enrolment_id,
        e.start_date as enrolment_start_date,
        co.name as course_name,
        co.price::numeric as course_price,
        CONCAT(
          TO_CHAR(se.start_time, 'HH12:MI AM'), 
          ' - ', 
          TO_CHAR(se.end_time, 'HH12:MI AM')
        ) as session_time,
        se.weekday as session_weekday,
        ri.id as recurring_invoice_id,
        ri.amount::numeric as recurring_invoice_amount,
        ri.description as recurring_invoice_description,
        ri.next_date as recurring_invoice_next_date,
        (ct.total_enrollments + ct.total_pickups)::numeric as customer_total_expected,
        ct.total_enrollments::numeric as customer_total_enrollments,
        ct.total_pickups::numeric as customer_total_pickups,
        cn.customer_note_id,
        cn.customer_note,
        cn.customer_note_date,
        cn.customer_note_creator,
        sn.student_note_id,
        sn.student_note,
        sn.student_note_date,
        sn.student_note_creator
      FROM enrolments e
      INNER JOIN students s ON e.student_id = s.id
      INNER JOIN customers c ON s.customer_id = c.id
      INNER JOIN courses co ON e.course_id = co.id
      INNER JOIN sessions se ON e.session_id = se.id
      LEFT JOIN customer_totals ct ON ct.customer_id = c.id
      LEFT JOIN recent_customer_notes cn ON cn.customer_id = c.id
      LEFT JOIN recent_student_notes sn ON sn.student_id = s.id
      LEFT JOIN LATERAL (
        SELECT id, amount, description, next_date
        FROM recurring_invoices
        WHERE customer_id = c.id
        ORDER BY next_date DESC NULLS LAST, start_date DESC
        LIMIT 1
      ) ri ON true
      WHERE e.start_date >= ${startDate}::date
        AND e.start_date <= ${endDate}::date
      ORDER BY e.start_date DESC, c.name, s.name;
    `;
    
    return enrollments;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch enrollment report.');
  }
}
